import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

// Render one actual component at a time. Keep each render's event handlers so
// tests can dispatch two UI actions before React would commit the next render.
function fixture({ quote = "", draft = "", handoffId, values = new Map() } = {}) {
	let definition;
	let active;
	let storageBlocked = false;
	const native = { draft: "", quotes: [] };
	const hostInput = {
		state: { getSnapshot: () => native },
		setDraft(value) { native.draft = value; },
		insertQuote(value) { native.quotes.push(value); return true; }
	};
	const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });
	const react = {
		createElement,
		Component: class {},
		createContext: (value) => ({ value }),
		useState(initial) {
			const cell = active.cell(() => ({
				value: typeof initial === "function" ? initial() : initial
			}));
			return [cell.value, (next) => {
				cell.value = typeof next === "function" ? next(cell.value) : next;
			}];
		},
		useRef(value) { return active.cell(() => ({ current: value })); },
		useEffect(effect, deps) {
			const frame = active;
			const cell = frame.cell(() => ({}));
			if (!cell.deps || !deps || deps.some((dep, i) => !Object.is(dep, cell.deps[i]))) {
				frame.effects.push(() => {
					cell.cleanup?.();
					cell.deps = deps;
					cell.cleanup = effect();
				});
			}
		},
		useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
		useMemo: (fn) => fn(),
		useCallback: (fn) => fn
	};
	runInNewContext(source, {
		window: { __ModuleLoader__: { load(value) { definition = value; } } },
		localStorage: {
			get length() { return values.size; },
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => {
				if (storageBlocked && key.includes(".composer.")) throw new Error("injected storage failure");
				values.set(key, value);
			},
			removeItem: (key) => { values.delete(key); },
			key: (i) => [...values.keys()][i] ?? null,
		},
		console,
		setTimeout,
		clearTimeout,
		requestAnimationFrame: (callback) => callback(),
	});
	const mod = definition.factory(() => react);
	const registrations = new Map();
	let current = "parent";
	const listSnapshot = { byId: {}, ids: [] };
	const sidebar = { focus() {}, active: () => ({ id: "tab" }), openTab() { assert.fail("live panel must be reused"); } };
	let open;
	const ctx = {
		get: (name) => ({
			conversation: { input: { for: () => hostInput } },
			sidebarRight: sidebar
		})[name],
		provide: (_name, service) => { open = service.open; return () => {}; },
		sessions: {
			binding: () => undefined,
			list: {
				getSnapshot: () => Object.assign(listSnapshot, { current }),
				subscribe: () => () => {},
			}
		},
		effect: (fn) => fn(),
		slots: {
			inject: (_name, fn) => fn(),
			register: (opts, component) => {
				registrations.set(opts.name, component);
				return () => {};
			}
		}
	};
	mod.apply(ctx);
	const panel = registrations.get("sidebar.right.pane.tab")({}).children[0].type;

	function renderComponent(Component, props) {
		const hooks = [];
		let index;
		const frame = {
			effects: [],
			cell(make) {
				const i = index++;
				return hooks[i] ?? (hooks[i] = make());
			},
			render() {
				index = 0;
				active = frame;
				try { return Component(props); }
				finally {
					active = undefined;
					frame.effects.splice(0).forEach((effect) => effect());
				}
			},
			unmount() { for (const hook of hooks) hook.cleanup?.(); },
		};
		return frame;
	}
	const session = { prompt: async () => ({ ok: true }) };
	const sideB = { prompt: async () => ({ ok: true }) };
	const bindings = { "side-a": { session, ctx: {} }, "side-b": { session: sideB, ctx: {} } };
	ctx.sessions.binding = (id) => bindings[id];
	const panelFrame = renderComponent(panel, {
		ctx, sessionId: "parent", useTabInfo: () => ({
			tab: { id: "tab", navigation: { params: { parentSessionId: "parent", childId: "side-a", quote, draft, handoffId } } }
		})
	});
	panelFrame.render();
	function panelBody() { return panelFrame.render(); }
	function findComposer(id) {
		for (let frame = 0; frame < 5; frame++) {
			const composer = find(panelBody(), (n) => n.props.childId === id && n.props.session === bindings[id].session);
			if (composer) return composer;
		}
		assert.fail("host slot should render the side composer for " + id);
	}
	return {
		native, values, session, sideB, panelBody,
		get composer() { return findComposer("side-a"); },
		setCurrent: (id) => { current = id; },
		importDraft: (text) => open("parent", text),
		importQuote: (text) => mod.__test.openSideChat(ctx, "parent", "", text),
		switchTo: (id) => mod.__test.openSideChat(ctx, "parent", "", "", { childId: id }),
		blockStorage: (value) => { storageBlocked = value; },
		render(opts = {}) {
			const composer = findComposer(opts.childId ?? "side-a");
			return renderComponent(composer.type, { ...composer.props, ...opts });
		},
		renderIsolated(opts) {
			const composer = findComposer("side-a");
			return renderComponent(composer.type, { ...composer.props, ...opts });
		}
	};
}

function find(node, predicate) {
	if (Array.isArray(node)) {
		for (const child of node) {
			const match = find(child, predicate);
			if (match) return match;
		}
		return null;
	}
	if (node === null || typeof node !== "object") return null;
	return predicate(node) ? node : find(node.children, predicate);
}
const field = (nodes) => find(nodes, (n) => n.type === "textarea");
const sendButton = (nodes) => find(nodes, (n) => n.props.className === "dsh-sidechat-send");
const enter = { key: "Enter", preventDefault() {} };
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
	let resolve;
	const promise = new Promise((r) => { resolve = r; });
	return { promise, resolve };
}
const storedText = (f, child) => JSON.parse(f.values.get("dsh.sidechat.v1.composer." + child)).text;

test("a rapid Enter and click before the next render queue one prompt", async () => {
	const f = fixture();
	const wait = deferred();
	const calls = [];
	f.session.prompt = async (...args) => { calls.push(args); return wait.promise; };
	const view = f.render();
	field(view.render()).props.onChange({ target: { value: "question" } });
	const nodes = view.render();
	field(nodes).props.onKeyDown(enter);
	sendButton(nodes).props.onClick();
	wait.resolve({ ok: true });
	await flush();
	assert.equal(calls.length, 1);
	assert.equal(calls[0][0][0].text, "question");
	assert.equal(calls[0][1], "queue");
	assert.equal(field(view.render()).props.value, "");
});

test("a successful send does not erase a newer draft typed while waiting", async () => {
	const f = fixture();
	const wait = deferred();
	f.session.prompt = () => wait.promise;
	const view = f.render();
	field(view.render()).props.onChange({ target: { value: "question" } });
	sendButton(view.render()).props.onClick();
	field(view.render()).props.onChange({ target: { value: "next draft" } });
	wait.resolve({ ok: true });
	await flush();
	assert.equal(field(view.render()).props.value, "next draft");
	assert.equal(storedText(f, "side-a"), "next draft");
});

test("a rejected send retains the draft and is retryable", async () => {
	const f = fixture();
	let calls = 0;
	f.session.prompt = async () => ++calls === 1 ? { ok: false, error: { message: "offline" } } : { ok: true };
	const view = f.render();
	field(view.render()).props.onChange({ target: { value: "retain me" } });
	sendButton(view.render()).props.onClick();
	await flush();
	assert.equal(field(view.render()).props.value, "retain me");
	assert.equal(storedText(f, "side-a"), "retain me");
	sendButton(view.render()).props.onClick();
	await flush();
	assert.equal(calls, 2);
	assert.equal(field(view.render()).props.value, "");
});

test("a late acknowledgment does not erase another child's draft after a switch", async () => {
	const f = fixture();
	assert.equal(f.composer.props.key, "side-a");
	const wait = deferred();
	f.session.prompt = () => wait.promise;
	const a = f.render();
	field(a.render()).props.onChange({ target: { value: "submit A" } });
	sendButton(a.render()).props.onClick();
	a.unmount();

	const b = f.renderIsolated({ childId: "side-b", session: { prompt: async () => ({ ok: true }) } });
	field(b.render()).props.onChange({ target: { value: "draft B" } });
	wait.resolve({ ok: true });
	await flush();
	assert.equal(storedText(f, "side-a"), "");
	assert.equal(storedText(f, "side-b"), "draft B");
	assert.equal(field(b.render()).props.value, "draft B");
});

test("the side composer disappears when the child becomes the main conversation", () => {
	const f = fixture();
	f.setCurrent("side-a");
	const body = f.panelBody();
	assert.ok(find(body, (n) => n.props.className === "dsh-sidechat-handoff"));
	assert.equal(find(body, (n) => n.props.session === f.session && n.props.childId === "side-a"), null);
});


function takePrompts(session, reply = async () => ({ ok: true })) {
	const prompts = [];
	session.prompt = async (parts, mode) => {
		prompts.push({ text: parts.map((part) => part.text).join(""), mode });
		return reply();
	};
	return prompts;
}
const twoCards = "> **引用 · 第一张**\n> A\n>\n> A2\n\n这里是随附文字\n\n> **Quoted · Second**\n> B";

test("selection opens a quote preview and goes to the child prompt with typed text", async () => {
	const f = fixture({ quote: "quoted selection\r\n\r\nsecond paragraph" });
	const prompts = takePrompts(f.session);
	const view = f.render();
	assert.ok(find(view.render(), (n) => n.type === "blockquote"));
	field(view.render()).props.onChange({ target: { value: "explain this" } });
	sendButton(view.render()).props.onClick();
	await flush();
	assert.deepEqual(prompts, [{ text: "> quoted selection\n>\n> second paragraph\n\nexplain this", mode: "queue" }]);
	assert.deepEqual(f.native, { draft: "", quotes: [] });
	assert.equal(find(view.render(), (n) => n.type === "blockquote"), null);
});

test("mixed cards and prose stay ordered, survive a refused send, and retry exactly once", async () => {
	const f = fixture({ draft: twoCards, handoffId: "mixed" });
	let attempts = 0;
	const prompts = takePrompts(f.session, async () => ++attempts === 1 ? { ok: false } : { ok: true });
	const view = f.render();
	assert.equal(sendButton(view.render()).props.disabled, false, "a quote-only or imported draft is sendable");
	sendButton(view.render()).props.onClick();
	await flush();
	assert.ok(find(view.render(), (n) => n.type === "blockquote"), "failure keeps the entire import");
	sendButton(view.render()).props.onClick();
	await flush();
	const text = "> A\n>\n> A2\n\n这里是随附文字\n\n> B";
	assert.deepEqual(prompts, [{ text, mode: "queue" }, { text, mode: "queue" }]);
	assert.equal(sendButton(view.render()).props.disabled, true);
});

test("later imports survive an earlier queued send and identical intentional imports are not deduped", async () => {
	const f = fixture();
	const wait = deferred();
	const prompts = takePrompts(f.session, () => wait.promise);
	const view = f.render();
	assert.equal(f.importQuote("same"), true);
	sendButton(view.render()).props.onClick();
	assert.equal(f.importQuote("same"), true);
	assert.equal(f.importQuote("same"), true);
	wait.resolve({ ok: true });
	await flush();
	sendButton(view.render()).props.onClick();
	await flush();
	assert.deepEqual(prompts.map((p) => p.text), ["> same", "> same\n\n> same"]);
});

test("refresh restores unsent handoffs, and sent or removed handoffs do not replay", async () => {
	const options = { quote: "one", handoffId: "route-one", values: new Map() };
	fixture(options).render().render();
	let f = fixture(options);
	let prompts = takePrompts(f.session);
	let view = f.render();
	sendButton(view.render()).props.onClick();
	await flush();
	assert.deepEqual(prompts.map((p) => p.text), ["> one"]);

	f = fixture(options);
	view = f.render();
	assert.equal(sendButton(view.render()).props.disabled, true);
	assert.equal(f.importQuote("remove me"), true);
	find(view.render(), (n) => n.type === "button" && n.props["aria-label"] === "Remove imported text").props.onClick();
	f = fixture(options);
	assert.equal(sendButton(f.render().render()).props.disabled, true);
});

test("switching the live panel and refreshing do not move A's handoff to B or the parent", async () => {
	const options = { quote: "belongs to A", handoffId: "route-a", values: new Map() };
	let f = fixture(options);
	const a = f.render();
	field(a.render()).props.onChange({ target: { value: "draft A" } });
	assert.equal(f.switchTo("side-b"), true);
	let b = f.render({ childId: "side-b" });
	assert.equal(sendButton(b.render()).props.disabled, true);
	assert.equal(f.importDraft("belongs to B"), true);

	f = fixture(options);
	b = f.render({ childId: "side-b" });
	const promptsB = takePrompts(f.sideB);
	sendButton(b.render()).props.onClick();
	await flush();
	assert.deepEqual(promptsB.map((p) => p.text), ["belongs to B"]);
	assert.equal(f.switchTo("side-a"), true);
	const promptsA = takePrompts(f.session);
	const restored = f.render();
	sendButton(restored.render()).props.onClick();
	await flush();
	assert.deepEqual(promptsA.map((p) => p.text), ["> belongs to A\n\ndraft A"]);
	assert.deepEqual(f.native, { draft: "", quotes: [] });
});

test("a storage refusal leaves a mixed handoff intact in memory", async () => {
	const f = fixture();
	const view = f.render();
	f.blockStorage(true);
	assert.equal(f.importDraft(twoCards), true);
	assert.ok(find(view.render(), (n) => n.type === "blockquote"));
	f.blockStorage(false);
	const prompts = takePrompts(f.session);
	sendButton(view.render()).props.onClick();
	await flush();
	assert.equal(prompts[0].text, "> A\n>\n> A2\n\n这里是随附文字\n\n> B");
});

test("reopening the same child while sending does not allow a second submit", async () => {
	const f = fixture();
	const wait = deferred();
	const prompts = takePrompts(f.session, () => wait.promise);
	const first = f.render();
	field(first.render()).props.onChange({ target: { value: "one submit" } });
	sendButton(first.render()).props.onClick();
	first.unmount();

	const reopened = f.render();
	assert.equal(sendButton(reopened.render()).props.disabled, true);
	field(reopened.render()).props.onKeyDown(enter);
	wait.resolve({ ok: true });
	await flush();
	assert.deepEqual(prompts.map((p) => p.text), ["one submit"]);
	assert.equal(field(reopened.render()).props.value, "", "the reopened editor observes the acknowledgment");
});

test("an existing plain-text draft migrates without losing new imports", async () => {
	const legacyKey = "dsh.sidechat.v1.draft.side-a";
	const values = new Map([[legacyKey, "existing draft"]]);
	const f = fixture({ values, quote: "quote", handoffId: "migration" });
	assert.equal(field(f.render().render()).props.value, "existing draft");
	assert.equal(values.has(legacyKey), false);
	const prompts = takePrompts(f.session);
	sendButton(f.render().render()).props.onClick();
	await flush();
	assert.deepEqual(prompts.map((p) => p.text), ["> quote\n\nexisting draft"]);
});
