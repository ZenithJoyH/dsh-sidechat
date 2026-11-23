import { test } from "node:test";
import assert from "node:assert/strict";

let captured;
globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition; } } };
await import("../lib/client.js");

const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [initial, () => {}],
	useEffect: () => {},
	useRef: (value) => ({ current: value }),
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
	createContext: (value) => ({ value }),
	useContext: () => null
};

function loadClient() {
	return captured.factory(() => reactStub);
}

const mod = loadClient();

function fakeContext(options = {}) {
	const calls = { effects: [], slotInjects: [], registers: [], tabTypes: [], localeRegistrations: [] };
	const listeners = new Set();
	const localeSnapshot = { active: options.locale ?? "en" };
	const ctx = {
		sessions: {
			list: { getSnapshot: () => ({ current: "s1", byId: {}, ids: [] }), subscribe: () => () => {} },
			fork: async () => "child",
			binding: () => undefined,
			scope: () => undefined,
			open: () => {}
		},
		get(name) {
			if (name === "locale" && options.withLocale !== false) {
				return {
					getSnapshot: () => localeSnapshot,
					subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
					register: (ns, locale, dict) => { calls.localeRegistrations.push({ ns, locale, dict }); return () => {}; }
				};
			}
			return undefined;
		},
		effect(fn) { calls.effects.push(fn); const dispose = fn(); return dispose ?? (() => {}); },
		inject(deps, callback) {
			const injected = {
				get: (name) => name === "sidebarRightTabs" ? {
					register(definition) { calls.tabTypes.push(definition); return () => {}; }
				} : undefined
			};
			const dispose = callback(injected);
			return dispose ?? (() => {});
		},
		slots: {
			inject(name, factory) { calls.slotInjects.push(name); return factory(); },
			register(options, component) { calls.registers.push({ options, component }); return () => {}; }
		}
	};
	return { ctx, calls, localeSnapshot, listeners };
}

test("apply declares the plugin inject list and registers one tab type", () => {
	assert.deepEqual(mod.inject, ["slots", "sessions"]);
	const { ctx, calls } = fakeContext();
	mod.apply(ctx);
	assert.equal(calls.tabTypes.length, 1);
	const type = calls.tabTypes[0];
	assert.equal(type.kind, "side-chat");
	assert.equal(type.id, "dsh-sidechat:panel");
	assert.equal(type.multiple, true, "each side chat is its own tab");
	assert.equal(type.keepMounted, true, "hiding a tab must not stop its thread");
	assert.equal(type.priority, "extension");
	assert.equal(type.title("sidebar://side-chat"), "Side chat");
	assert.equal(type.guide.length, 1);
});

test("apply registers the panel, header, selection and conversation seats", () => {
	const { ctx, calls } = fakeContext();
	mod.apply(ctx);
	const names = calls.registers.map((entry) => entry.options.name).sort();
	assert.deepEqual(names, [
		"conversation.chat.text-interaction",
		"conversation.session.header.utilities",
		"dshside.conversation",
		"sidebar.right.pane.tab",
		"sidebar.right.pane.tab.title"
	]);
	const panel = calls.registers.find((entry) => entry.options.name === "sidebar.right.pane.tab");
	assert.equal(panel.options.key, "dsh-sidechat:panel");
	assert.deepEqual(panel.options.children, { "dshside.conversation": { kind: "single", scope: "session" } });
	const injected = panel.options.inject("s1");
	assert.equal(injected.sessionId, "s1");
	assert.equal(injected.ctx, ctx);
});

test("the header entry renders nothing without a current session", () => {
	const { ctx, calls } = fakeContext();
	mod.apply(ctx);
	ctx.sessions.list.getSnapshot = () => ({ current: "", byId: {}, ids: [] });
	const header = calls.registers.find((entry) => entry.options.name === "conversation.session.header.utilities");
	assert.equal(header.component({ ctx }), null);
});

test("the header entry renders a button for a current session", () => {
	const { ctx, calls } = fakeContext();
	mod.apply(ctx);
	const header = calls.registers.find((entry) => entry.options.name === "conversation.session.header.utilities");
	const node = header.component({ ctx });
	assert.equal(node.type, "span", "the entry wraps a button and its picker");
	const button = node.children[0];
	assert.equal(button.type, "button");
	assert.equal(button.props.title, "Fork this conversation into a side chat");
});

test("copy follows the host locale and registered dictionaries", () => {
	const { ctx, calls, localeSnapshot } = fakeContext({ locale: "en" });
	mod.apply(ctx);
	const registered = calls.localeRegistrations.map((entry) => entry.locale).sort();
	assert.deepEqual(registered, ["en", "zh"]);
	const type = calls.tabTypes[0];
	assert.equal(type.title("x"), "Side chat");
	localeSnapshot.active = "zh-CN";
	assert.equal(type.title("x"), "侧聊");
	const header = calls.registers.find((entry) => entry.options.name === "conversation.session.header.utilities");
	assert.equal(header.component({ ctx }).children[0].props.title, "从当前会话分叉一个侧边聊天");
});

test("without a locale service the browser language decides", () => {
	mod.__test.resetLocale();
	const { ctx, calls } = fakeContext({ withLocale: false });
	mod.apply(ctx);
	assert.equal(calls.localeRegistrations.length, 0);
	assert.equal(calls.tabTypes[0].title("x"), "Side chat");
});

test("topicOf flattens and bounds the first question", () => {
	assert.equal(mod.__test.topicOf("  如何  优化\n检索？ "), "如何 优化 检索？");
	const long = "字".repeat(80);
	assert.equal(mod.__test.topicOf(long).length, 33);
	assert.equal(mod.__test.topicOf(""), "");
});

test("sideTitleOf falls back to the tab label", () => {
	assert.equal(mod.__test.sideTitleOf("对比两种实现"), "对比两种实现");
	assert.equal(mod.__test.sideTitleOf(""), "Side chat");
});

test("visibleSessionList hides owned children and rows still being forked", () => {
	const visibility = mod.__test;
	visibility.resetVisibility();
	const list = {
		ids: ["a", "b", "c"],
		byId: { a: { id: "a" }, b: { id: "b" }, c: { id: "c" } }
	};
	assert.deepEqual(visibility.visibleSessionList(list, visibility.visibilitySnapshot()), list);
	visibility.hideSession("b");
	const hiddenOne = visibility.visibleSessionList(list, visibility.visibilitySnapshot());
	assert.deepEqual(hiddenOne.ids, ["a", "c"]);
	assert.deepEqual(Object.keys(hiddenOne.byId), ["a", "c"]);
	// A row minted after the fork started must stay out of the list until the
	// fork resolves, then be hidden by id.
	const release = visibility.beginListWindow({ ids: ["a", "b", "c"] });
	const during = visibility.visibleSessionList(
		{ ids: ["a", "b", "c", "d"], byId: { a: {}, b: {}, c: {}, d: {} } },
		visibility.visibilitySnapshot()
	);
	assert.deepEqual(during.ids, ["a", "c"]);
	release();
	visibility.showSession("b");
	assert.deepEqual(visibility.visibleSessionList(list, visibility.visibilitySnapshot()), list);
	visibility.resetVisibility();
});


function fakeStorage() {
	const data = new Map();
	return {
		get length() { return data.size; },
		key: (index) => [...data.keys()][index] ?? null,
		getItem: (key) => (data.has(key) ? data.get(key) : null),
		setItem: (key, value) => { data.set(key, String(value)); },
		removeItem: (key) => { data.delete(key); }
	};
}

test("the workspace list filter hides owned threads and keeps the rest", () => {
	globalThis.localStorage = fakeStorage();
	mod.__test.resetVisibility();
	mod.__test.hideSession("child-1");
	const entries = [];
	const listeners = new Set();
	const slots = {
		entries: () => entries,
		subscribe: (name, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
		inject: (name, factory) => factory(),
		register: () => () => {}
	};
	const original = (props) => reactStub.createElement("list", props);
	const entry = { component: original, children: { "sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" } } };
	entries.push(entry);
	const ctx = { slots };
	mod.__test.registerSessionListFilter(ctx);
	assert.notEqual(entry.component, original, "the entry is wrapped");
	const element = entry.component({ useSessions: (selector) => selector({ ids: ["main", "child-1"], byId: { main: {}, "child-1": {} } }) });
	// createElement returns the element for the original component; rendering it
	// is what proves the injected feed reaches the list.
	const node = element.type(element.props);
	assert.equal(node.type, "list");
	const projected = node.props.useSessions((state) => state.ids);
	assert.deepEqual(projected, ["main"]);
});

test("the tab title follows the thread's first question", () => {
	globalThis.localStorage = fakeStorage();
	const tabId = "tab-1";
	const parentId = "parent-1";
	const { ctx, calls } = fakeContext();
	mod.apply(ctx);
	const title = calls.registers.find((item) => item.options.name === "sidebar.right.pane.tab.title");
	const props = { ...title.options.inject(parentId), useTabInfo: () => ({ tab: { id: tabId, navigation: { params: { parentSessionId: parentId } } } }) };
	assert.equal(title.component(props), "Side chat");
	globalThis.localStorage.setItem(
		"dsh.sidechat.v1." + parentId + ":" + tabId,
		JSON.stringify({ childId: "child-1", topic: "如何优化检索" })
	);
	assert.equal(title.component(props), "如何优化检索");
});


test("the side session inherits the main model and effort", async () => {
	const calls = [];
	const ctx = {
		sessions: {
			binding: (id) => id === "parent-1"
				? { session: { projections: { faceOf: () => ({ getSnapshot: () => ({ next: { provider: "baai", model: "DeepSeek-V4.1-Flash-1017", reasoningEffort: "high" } }) }) } } }
				: undefined
		},
		get: (name) => name === "remote.session"
			? { selectModel: async (request) => { calls.push(request); return { ok: true }; } }
			: undefined
	};
	assert.equal(await mod.__test.syncModel(ctx, "parent-1", "child-1"), true);
	assert.deepEqual(calls, [{
		sessionId: "child-1",
		provider: "baai",
		model: "DeepSeek-V4.1-Flash-1017",
		reasoningEffort: "high"
	}]);
});

test("model sync stays silent when the host exposes no face", async () => {
	const ctx = { sessions: { binding: () => undefined }, get: () => undefined };
	assert.equal(await mod.__test.syncModel(ctx, "parent-1", "child-1"), false);
});


test("the inherited-history gate cuts exactly at the fork boundary", () => {
	assert.equal(mod.__test.isInheritedNode({ kind: "user", seq: 3 }, 5), true);
	assert.equal(mod.__test.isInheritedNode({ kind: "assistant", seq: 5 }, 5), true);
	assert.equal(mod.__test.isInheritedNode({ kind: "assistant", seq: 6 }, 5), false);
	assert.equal(mod.__test.isInheritedNode({ kind: "assistant", seq: 6 }, null), false);
	assert.equal(mod.__test.isInheritedNode({ kind: "assistant" }, 5), false);
});


test("quote-card Markdown is split into native quote segments", () => {
	const segments = mod.__test.parseQuoteCardDraft(
		"> **引用 · 选中文字**\n> 第一行\n> 第二行\n\n> **引用 · 助手 · 10:23**\n> 另一段"
	);
	assert.deepEqual(segments, [
		{ type: "quote", text: "第一行\n第二行" },
		{ type: "quote", text: "另一段" }
	]);
});

test("quote parsing accepts the English header and per-card replies", () => {
	const segments = mod.__test.parseQuoteCardDraft(
		"> **Quoted · Assistant · 10:23**\n> code\n\n为什么这样写？\n\n> **Quoted · Selection**\n> second"
	);
	assert.deepEqual(segments, [
		{ type: "quote", text: "code" },
		{ type: "text", text: "为什么这样写？" },
		{ type: "quote", text: "second" }
	]);
});

test("plain drafts stay plain", () => {
	assert.deepEqual(mod.__test.parseQuoteCardDraft("直接输入的问题"), [{ type: "text", text: "直接输入的问题" }]);
	assert.deepEqual(mod.__test.parseQuoteCardDraft(""), []);
});


test("the thread list keeps one entry per child, newest first", () => {
	const store = fakeStorage();
	globalThis.localStorage = store;
	assert.deepEqual(mod.__test.readThreadList("p1"), []);
	mod.__test.upsertThread("p1", { childId: "c1", topic: "第一个" });
	mod.__test.upsertThread("p1", { childId: "c2", topic: "第二个" });
	let list = mod.__test.readThreadList("p1");
	assert.deepEqual(list.map((item) => item.childId), ["c2", "c1"]);
	// Re-touching a thread moves it to the top without duplicating it.
	mod.__test.upsertThread("p1", { childId: "c1" });
	list = mod.__test.readThreadList("p1");
	assert.deepEqual(list.map((item) => item.childId), ["c1", "c2"]);
	assert.equal(mod.__test.threadTopic("p1", "c1"), "第一个");
	assert.deepEqual(mod.__test.readThreadList("p2"), []);
});


test("the fork cut is read from the inherited seed marker", () => {
	const session = {
		eventSource: {
			getSnapshot: () => ({ entries: [
				{ event: { type: "session/start", seq: 1 } },
				{ event: { type: "session/end-seed", seq: 42, data: { inherited: true } } },
				{ event: { type: "turn/end", seq: 43 } }
			] })
		}
	};
	assert.equal(mod.__test.forkBoundaryOf(session), 41);
});

test("a non-fork session has no cut, and a broken source is tolerated", () => {
	assert.equal(mod.__test.forkBoundaryOf({ eventSource: { getSnapshot: () => ({ entries: [{ event: { type: "session/start", seq: 1 } }] }) } }), null);
	assert.equal(mod.__test.forkBoundaryOf({}), null);
	assert.equal(mod.__test.forkBoundaryOf({ eventSource: { getSnapshot: () => { throw new Error("x"); } } }), null);
});

test("rows at or before the cut belong to the parent conversation", () => {
	const cut = 41;
	assert.equal(mod.__test.isInheritedNode({ seq: 12 }, cut), true);
	assert.equal(mod.__test.isInheritedNode({ seq: 41 }, cut), true);
	assert.equal(mod.__test.isInheritedNode({ seq: 42 }, cut), false);
	assert.equal(mod.__test.isInheritedNode({ seq: 12 }, null), false);
});

test("the newest row seq spans every kind of row", () => {
	assert.equal(mod.__test.lastSeqOf({ nodes: [{ seq: 3 }, { seq: 9 }, { seq: 5 }] }), 9);
	assert.equal(mod.__test.lastSeqOf(null), 0);
});


test("thread labels fall back to the thread's age, not an invented number", () => {
	mod.__test.resetLocale();
	const list = [{ childId: "a", topic: "如何优化检索" }];
	assert.equal(mod.__test.threadLabel(list[0], 0, 1), "如何优化检索");
	const aged = mod.__test.threadLabel({ childId: "b", createdAt: Date.now() - 3 * 86_400_000 }, 1, 3);
	assert.match(aged, /^Side chat · 3 d ago$/);
	// Without any timestamp the label stays free of numbers too.
	assert.equal(mod.__test.threadLabel({ childId: "c" }, 2, 3), "Side chat");
});

test("relative time degrades from minutes to days", () => {
	mod.__test.resetLocale();
	const now = Date.now();
	assert.equal(mod.__test.relativeTime(now - 5_000), "just now");
	assert.equal(mod.__test.relativeTime(now - 5 * 60_000), "5 min ago");
	assert.equal(mod.__test.relativeTime(now - 3 * 3_600_000), "3 h ago");
	assert.equal(mod.__test.relativeTime(now - 2 * 86_400_000), "2 d ago");
	assert.equal(mod.__test.relativeTime(undefined), "");
});

function sidebarDouble(options = {}) {
	const calls = { openTab: [], focus: [], toggleExpanded: 0 };
	return {
		calls,
		sidebar: {
			openTab: (kind, params) => { calls.openTab.push({ kind, params }); },
			focus: (id) => { calls.focus.push(id); if (options.focusThrows === true) throw new Error("gone"); },
			active: () => (options.activeId === undefined ? { id: options.focusResult ?? "tab-1" } : { id: options.activeId }),
			isExpanded: () => options.expanded !== false,
			toggleExpanded: () => { calls.toggleExpanded += 1; }
		}
	};
}

test("a second open reuses the open panel instead of forking another tab", () => {
	globalThis.localStorage = fakeStorage();
	globalThis.localStorage.setItem("dsh.sidechat.v1.open.parent-1", "tab-1");
	const { calls, sidebar } = sidebarDouble({ focusResult: "tab-1" });
	const ctx = { get: (name) => (name === "sidebarRight" ? sidebar : undefined) };
	assert.equal(mod.__test.openSideChat(ctx, "parent-1", "", "", { childId: "child-9" }), true);
	assert.deepEqual(calls.focus, ["tab-1"]);
	assert.equal(calls.openTab.length, 0, "no second tab");
	assert.equal(mod.__test.threadRequestFor("parent-1").childId, "child-9", "the live panel is told to switch");
});

test("a remembered tab that is gone falls back to opening a new one", () => {
	globalThis.localStorage = fakeStorage();
	globalThis.localStorage.setItem("dsh.sidechat.v1.open.parent-1", "tab-dead");
	const { calls, sidebar } = sidebarDouble({ focusResult: "other-tab" });
	const ctx = { get: (name) => (name === "sidebarRight" ? sidebar : undefined) };
	assert.equal(mod.__test.openSideChat(ctx, "parent-1", "", "", { childId: "child-2" }), true);
	assert.equal(calls.openTab.length, 1);
	assert.equal(calls.openTab[0].params.params.childId, "child-2");
});

test("a first open creates a tab for a brand-new thread", () => {
	globalThis.localStorage = fakeStorage();
	const { calls, sidebar } = sidebarDouble();
	const ctx = { get: (name) => (name === "sidebarRight" ? sidebar : undefined) };
	assert.equal(mod.__test.openSideChat(ctx, "parent-2"), true);
	assert.equal(calls.openTab.length, 1);
	assert.equal(calls.openTab[0].params.params.parentSessionId, "parent-2");
	assert.equal("childId" in calls.openTab[0].params.params, false);
});


test("the host session title outranks the first question", () => {
	const store = fakeStorage();
	globalThis.localStorage = store;
	const ctx = {
		sessions: {
			list: { getSnapshot: () => ({ ids: ["c1"], byId: { c1: { id: "c1", title: "优化 4K1K profiling" } } }), subscribe: () => () => {} }
		}
	};
	mod.__test.upsertThread("p9", { childId: "c1", topic: "第一个问题" });
	assert.equal(mod.__test.sessionTitleOf(ctx, "c1"), "优化 4K1K profiling");
	assert.equal(
		mod.__test.threadLabel({ childId: "c1", topic: "第一个问题" }, 0, 1, mod.__test.sessionTitleOf(ctx, "c1")),
		"优化 4K1K profiling"
	);
	// Without a host title the first question still wins over the ordinal.
	assert.equal(mod.__test.threadLabel({ childId: "c2", topic: "第二个问题" }, 1, 2, ""), "第二个问题");
	assert.equal(mod.__test.sessionTitleOf(ctx, "missing"), "");
});


function storageStub() {
	const data = new Map();
	return {
		getItem: (k) => (data.has(k) ? data.get(k) : null),
		setItem: (k, v) => { data.set(k, String(v)); },
		removeItem: (k) => { data.delete(k); }
	};
}

test("the side composer resolves through the retained binding when the scope is absent", () => {
	const shell = { setDraft() {}, state: { getSnapshot: () => ({ draft: "" }) } };
	const bindingCtx = { tag: "binding-ctx" };
	const ctx = {
		sessions: {
			scope: () => undefined,
			binding: () => ({ ctx: bindingCtx })
		},
		get: (name) => name === "conversation"
			? { input: { for: (address) => (address === bindingCtx ? shell : null) } }
			: undefined
	};
	assert.equal(mod.__test.sessionInput(ctx, "child-1"), shell);
});

test("a broken scope lookup does not stop the binding fallback", () => {
	const shell = { setDraft() {}, state: { getSnapshot: () => ({ draft: "" }) } };
	const ctx = {
		sessions: {
			scope: () => { throw new Error("no scope"); },
			binding: () => ({ ctx: { tag: "b" } })
		},
		get: () => ({ input: { for: () => shell } })
	};
	assert.equal(mod.__test.sessionInput(ctx, "child-1"), shell);
});

test("seed hashes identify content, so a new hand-off still lands", () => {
	const same = mod.__test.seedHashOf("同一段引用");
	assert.equal(mod.__test.seedHashOf("同一段引用"), same);
	assert.notEqual(mod.__test.seedHashOf("另一段引用"), same);
	assert.equal(mod.__test.seedHashOf(""), "");
});

test("the thread record remembers which hand-off was inserted", () => {
	globalThis.localStorage = storageStub();
	const parent = "parent-9";
	const tab = "tab-9";
	mod.__test.writeThread(parent, tab, { childId: "child-9" });
	assert.equal(mod.__test.readThread(parent, tab).seedHash, "");
	const hash = mod.__test.seedHashOf("> 引用内容");
	mod.__test.writeThread(parent, tab, { seeded: true, seedHash: hash });
	const record = mod.__test.readThread(parent, tab);
	assert.equal(record.seedHash, hash);
	assert.equal(record.seeded, true);
	assert.equal(record.childId, "child-9", "other fields survive the patch");
});


test("the last-resort quote keeps the words without Markdown markers", () => {
	mod.__test.resetLocale();
	assert.equal(mod.__test.quoteFallback("old patch @ c32", "Quoted:"), "Quoted:\nold patch @ c32\n\n");
	assert.equal(mod.__test.quoteFallback("   ", "Quoted:"), "");
	assert.equal(mod.__test.quoteFallback("body", ""), "body\n\n");
});


test("a forked title equal to the parent's is not a side chat name", () => {
	const ctx = {
		sessions: {
			list: {
				getSnapshot: () => ({ ids: ["p", "c"], byId: { p: { id: "p", title: "主对话标题" }, c: { id: "c", title: "主对话标题" } } }),
				subscribe: () => () => {}
			}
		}
	};
	assert.equal(mod.__test.sessionTitleOf(ctx, "c"), "主对话标题");
	assert.equal(mod.__test.effectiveHostTitle(ctx, "p", "c"), "");
	// Once the child earns its own title it is used again.
	const ctx2 = {
		sessions: {
			list: {
				getSnapshot: () => ({ ids: ["p", "c"], byId: { p: { id: "p", title: "主对话标题" }, c: { id: "c", title: "优化 4K1K profiling" } } }),
				subscribe: () => () => {}
			}
		}
	};
	assert.equal(mod.__test.effectiveHostTitle(ctx2, "p", "c"), "优化 4K1K profiling");
});

test("lastTurnOf reads the newest covered turn", () => {
	assert.equal(mod.__test.lastTurnOf({ nodes: [{ turn: 1 }, { turn: 4 }, { turn: 2 }] }), 4);
	assert.equal(mod.__test.lastTurnOf({ nodes: [], turnTimings: new Map([[3, {}], [7, {}]]) }), 7);
	assert.equal(mod.__test.lastTurnOf(null), null);
});


test("recovery rebuilds the thread list from durable tab records", () => {
	globalThis.localStorage = fakeStorage();
	// A tab record survives independently of the list projection.
	globalThis.localStorage.setItem(
		"dsh.sidechat.v1.parent-r:tab-1",
		JSON.stringify({ childId: "child-r", topic: "旧侧聊问题", boundary: 12, turn: 3 })
	);
	assert.deepEqual(mod.__test.readThreadList("parent-r"), []);
	assert.equal(mod.__test.recoverThreads("parent-r"), 1);
	const list = mod.__test.readThreadList("parent-r");
	assert.equal(list.length, 1);
	assert.equal(list[0].childId, "child-r");
	assert.equal(list[0].topic, "旧侧聊问题");
	assert.equal(list[0].boundary, 12);
	// Running it twice must not duplicate.
	assert.equal(mod.__test.recoverThreads("parent-r"), 0);
});


test("clearing side chats removes every key this plugin owns", () => {
	globalThis.localStorage = fakeStorage();
	globalThis.localStorage.setItem("dsh.sidechat.v1.threads.p", JSON.stringify([{ childId: "c1" }]));
	globalThis.localStorage.setItem("dsh.sidechat.v1.p:tab", JSON.stringify({ childId: "c1" }));
	globalThis.localStorage.setItem("dsh.sidechat.v1.hidden", JSON.stringify(["c1"]));
	globalThis.localStorage.setItem("unrelated.key", "keep");
	const removed = mod.__test.clearAllSideChatData();
	assert.equal(removed, 3);
	assert.equal(globalThis.localStorage.getItem("dsh.sidechat.v1.threads.p"), null);
	assert.equal(globalThis.localStorage.getItem("dsh.sidechat.v1.p:tab"), null);
	assert.equal(globalThis.localStorage.getItem("dsh.sidechat.v1.hidden"), null);
	assert.equal(globalThis.localStorage.getItem("unrelated.key"), "keep");
	assert.deepEqual(mod.__test.readThreadList("p"), []);
});

