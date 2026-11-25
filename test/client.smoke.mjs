import { test } from "node:test";
import assert from "node:assert/strict";

let captured;
globalThis.window = {
	__ModuleLoader__: {
		load(definition) { captured = definition; }
	}
};

await import("../lib/client.js");

assert.equal(captured.id, "dsh-sidechat");
const fakeReact = {
	createElement: () => null,
	useState: () => [undefined, () => {}],
	useEffect: () => {},
	useRef: () => ({ current: null }),
	useCallback: (fn) => fn,
	useSyncExternalStore: () => undefined,
	createContext: (value) => ({ value }),
	Component: class { constructor(props) { this.props = props; this.state = {}; } },
	useContext: () => null
};
const mod = captured.factory((name) => {
	assert.equal(name, "react");
	return fakeReact;
});
const { assistantText, baselineOf, lastSideReply, quoteSelection } = mod.__test;

const assistant = (seq, value, extra = {}) => ({
	kind: "assistant",
	seq,
	blocks: [{ kind: "text", text: value }],
	...extra
});
const user = (seq) => ({ kind: "user", seq });

test("assistantText joins text blocks and skips interrupted turns", () => {
	assert.equal(assistantText(assistant(1, "a")).trim(), "a");
	assert.equal(assistantText({ kind: "assistant", seq: 2, interrupted: true, blocks: [{ kind: "text", text: "x" }] }), "");
	assert.equal(assistantText({ kind: "user", seq: 3 }), "");
});

test("baselineOf reads the newest assistant seq", () => {
	assert.equal(baselineOf({ nodes: [assistant(4, "x"), assistant(9, "y")] }), 9);
	assert.equal(baselineOf(null), 0);
});

test("lastSideReply ignores inherited history and answers before the baseline", () => {
	const inherited = { nodes: [user(1), assistant(2, "parent answer")] };
	assert.equal(lastSideReply(inherited, 2), "");
	assert.equal(lastSideReply({ nodes: [user(1), assistant(2, "old"), user(5), assistant(6, "side answer")] }, 2), "side answer");
});

test("lastSideReply drops an answer that belongs to an older question", () => {
	const snapshot = { nodes: [user(5), assistant(6, "first side answer"), user(7)] };
	assert.equal(lastSideReply(snapshot, 2), "");
});

test("a selection is quoted as Markdown blockquote", () => {
	assert.equal(quoteSelection("a\n\nb"), "> a\n>\n> b");
});
