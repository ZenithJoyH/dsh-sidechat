// dsh-sidechat — browser half.
//
// A Codex-style side thread for DSH:
//   * fork the current conversation into an independent child session;
//   * render that child with DSH's own chat view in a right-sidebar tab;
//   * ask a selection question there without interrupting the main line;
//   * bring the latest side answer back into the main composer;
//   * open the side thread as a normal conversation when it is worth keeping.
//
// The plugin intentionally owns no host route and no model loop: DSH's normal
// session/fork/prompt machinery runs the side thread, so tools, approvals,
// attachments and streaming behave exactly like the main conversation.
window.__ModuleLoader__.load({
	id: "dsh-sidechat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");

		const NS = "dsh-sidechat";
		const KIND = "side-chat";
		const IMPL = "dsh-sidechat:panel";
		const STORE_PREFIX = "dsh.sidechat.v1.";

		// ── copy ────────────────────────────────────────────────────────────

		const en = {
			tab: "Side chat",
			menu: "New side chat",
			newThread: "New",
			parentRunning: "Main is running",
			parentIdle: "Back to main",
			bringBack: "Bring back",
			broughtBack: "Added to the main composer",
			broughtBackClipboard: "Composer unavailable; copied to the clipboard",
			openAsSession: "Open as chat",
			preparing: "Forking from the main conversation…",
			emptyReply: "The side chat has no new answer yet",
			forkError: "Could not create the side chat",
			forkHint: "The main conversation needs one completed turn before it can be forked.",
			retry: "Retry",
			selection: "Ask in side chat",
			header: "Side",
			headerTitle: "Fork this conversation into a side chat",
			quoting: "About this selection:",
			switchThread: "Switch side chat",
			threadsCount: "Chats ({n})",
			currentThread: "Current",
			more: "More actions",
			clearAll: "Clear all side chats",
			childIsMain: "This side chat is open as the main conversation",
			childIsMainHint: "Use another side chat here, or close this panel. This thread continues in the main column.",
			clearConfirm: "Delete every side-chat record? The conversations stay on this machine, but they will no longer be listed here.",
			clearDone: "Cleared {n} side-chat records",
			pickerTitle: "Side chats",
			threadFallback: "Side chat {n}",
			threadEmpty: "No side chats yet",
			justNow: "just now",
			minutesAgo: "{n} min ago",
			hoursAgo: "{n} h ago",
			daysAgo: "{n} d ago",
			quoteLabel: "Quoted:"
		};
		const zh = {
			tab: "侧聊",
			menu: "新建侧边聊天",
			newThread: "新侧聊",
			parentRunning: "主对话运行中",
			parentIdle: "回到主对话",
			bringBack: "带回主对话",
			broughtBack: "已放入主对话输入框",
			broughtBackClipboard: "主输入框不可用，已复制到剪贴板",
			openAsSession: "在会话中打开",
			preparing: "正在从主对话分叉…",
			emptyReply: "侧聊还没有新的回答",
			forkError: "无法创建侧聊",
			forkHint: "当前会话还没有完成一轮对话，先在主对话聊一轮再试。",
			retry: "重试",
			selection: "在侧聊中提问",
			header: "侧聊",
			headerTitle: "从当前会话分叉一个侧边聊天",
			quoting: "关于这段内容：",
			switchThread: "切换侧聊",
			threadsCount: "侧聊（{n}）",
			currentThread: "当前",
			more: "更多操作",
			clearAll: "清理全部侧聊",
			childIsMain: "这个侧聊已作为主对话打开",
			childIsMainHint: "这里可以切换到别的侧聊，或关闭面板；这个线程的输入请用主对话的输入框继续。",
			clearConfirm: "确定清理所有侧聊记录吗？会话本身仍留在本机，只是不再出现在侧聊清单里。",
			clearDone: "已清理 {n} 条侧聊记录",
			pickerTitle: "侧聊记录",
			threadFallback: "侧聊 {n}",
			threadEmpty: "还没有侧聊",
			justNow: "刚刚",
			minutesAgo: "{n} 分钟前",
			hoursAgo: "{n} 小时前",
			daysAgo: "{n} 天前",
			quoteLabel: "引用："
		};

		// The locale service is optional (standalone composition, tests): fall back
		// to the browser language, mirroring the host's own resolution.
		let localeService;
		let dictionary = en;
		let dictionaryLocale = "";

		function attachLocale(service) {
			localeService = service;
			dictionary = en;
			dictionaryLocale = "";
			const disposers = [];
			try {
				if (typeof service?.register === "function") {
					disposers.push(service.register(NS, "en", en));
					disposers.push(service.register(NS, "zh", zh));
				}
			} catch (_error) {
				// Untyped namespaces are legal; a rejected dictionary is not fatal.
			}
			return () => {
				for (const dispose of disposers) {
					try { dispose?.(); } catch (_error) {}
				}
			};
		}

		function activeLocale() {
			try {
				const active = localeService?.getSnapshot?.()?.active;
				if (typeof active === "string" && active !== "") return active;
			} catch (_error) {}
			if (typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language !== "") return navigator.language;
			return "en";
		}

		function t(key) {
			const locale = activeLocale();
			if (locale !== dictionaryLocale) {
				dictionaryLocale = locale;
				dictionary = /^zh/i.test(locale) ? zh : en;
			}
			const value = dictionary[key];
			return typeof value === "string" ? value : (en[key] ?? key);
		}

		function subscribeLocale(listener) {
			try {
				return localeService?.subscribe?.(listener) ?? (() => {});
			} catch (_error) {
				return () => {};
			}
		}

		/** Re-render on a language switch: the copy above reads the active locale. */
		function useLocaleTick() {
			react.useSyncExternalStore(subscribeLocale, activeLocale, activeLocale);
		}

		// A live view of the dictionaries: every read resolves the active locale,
		// so existing T.x call sites follow the host language without a rebuild.
		const T = new Proxy({}, { get: (_target, key) => t(String(key)) });

		// ── thread records ──────────────────────────────────────────────────

		// tabId -> { parentId, childId, topic }. Persisted so a restored tab
		// reuses its child and keeps the title derived from its first question.
		const threads = new Map();
		const threadListeners = new Set();

		function threadKey(parentId, tabId) {
			return STORE_PREFIX + parentId + ":" + tabId;
		}

		function readThread(parentId, tabId) {
			try {
				const raw = localStorage.getItem(threadKey(parentId, tabId));
				if (raw === null) return null;
				const value = JSON.parse(raw);
				if (typeof value?.childId !== "string" || value.childId === "") return null;
				return {
					childId: value.childId,
					topic: typeof value.topic === "string" ? value.topic : "",
					seeded: value.seeded === true,
					// Which carried draft was already inserted (so a remount does not
					// repeat it, but a new hand-off still lands).
					seedHash: typeof value.seedHash === "string" ? value.seedHash : "",
					// Seq where the fork cut inherited history; 0/null until resolved.
					boundary: typeof value.boundary === "number" ? value.boundary : null,
					turn: typeof value.turn === "number" ? value.turn : null,
					fresh: value.fresh === true
				};
			} catch (_error) {
				return null;
			}
		}

		function writeThread(parentId, tabId, patch) {
			const current = readThread(parentId, tabId) ?? { childId: "", topic: "", seeded: false, seedHash: "", boundary: null };
			const next = {
				childId: patch.childId ?? current.childId,
				topic: patch.topic ?? current.topic,
				seeded: patch.seeded ?? current.seeded,
				seedHash: patch.seedHash ?? current.seedHash ?? "",
				// An explicit null clears the cut: a different child needs its own.
				boundary: Object.prototype.hasOwnProperty.call(patch, "boundary")
					? patch.boundary
					: (current.boundary ?? null),
				turn: Object.prototype.hasOwnProperty.call(patch, "turn")
					? patch.turn
					: (current.turn ?? null),
				fresh: patch.fresh ?? current.fresh ?? false
			};
			if (next.childId === "") return;
			threads.set(tabId, { parentId, ...next });
			try {
				localStorage.setItem(threadKey(parentId, tabId), JSON.stringify(next));
			} catch (_error) {
				// Private mode/quota: the in-memory mapping still serves this run.
			}
			notifyThreads();
		}

		function notifyThreads() {
			for (const listener of [...threadListeners]) {
				try { listener(); } catch (_error) {}
			}
		}

		function subscribeThreads(listener) {
			threadListeners.add(listener);
			return () => { threadListeners.delete(listener); };
		}

		function forgetThread(parentId, tabId) {
			threads.delete(tabId);
			try {
				localStorage.removeItem(threadKey(parentId, tabId));
			} catch (_error) {}
			notifyThreads();
		}


		// ── full reset ─────────────────────────────────────────────────────

		/**
		 * Remove every piece of side-chat state this plugin owns: thread lists,
		 * per-tab records (child bindings), hidden-session ids and pending drafts.
		 * The child sessions themselves belong to the host and are left alone —
		 * they are simply no longer reachable from the side-chat surfaces.
		 * @returns {number} how many storage keys were removed.
		 */
		function clearAllSideChatData() {
			let removed = 0;
			if (typeof localStorage !== "undefined") {
				const keys = [];
				for (let index = 0; index < localStorage.length; index += 1) {
					const key = localStorage.key(index);
					if (typeof key === "string" && key.startsWith(STORE_PREFIX)) keys.push(key);
				}
				for (const key of keys) {
					try {
						localStorage.removeItem(key);
						removed += 1;
					} catch (_error) {}
				}
			}
			threads.clear();
			hiddenIds = new Set();
			pendingLists = [];
			pendingDrafts.clear();
			threadRequests.clear();
			notifyThreads();
			publishVisibility(hiddenIds, []);
			return removed;
		}

		// ── thread list per main conversation ──────────────────────────────

		// Codex shows every side thread started from this conversation. A thread
		// is bound to its child session; the panel's tab only remembers which one
		// was last selected.
		const THREADS_PREFIX = STORE_PREFIX + "threads.";

		function threadsKey(parentId) {
			return THREADS_PREFIX + parentId;
		}

		function readThreadList(parentId) {
			try {
				const value = JSON.parse(localStorage.getItem(threadsKey(parentId)) ?? "[]");
				if (!Array.isArray(value)) return [];
				return value.filter((item) => typeof item?.childId === "string" && item.childId !== "");
			} catch (_error) {
				return [];
			}
		}

		function saveThreadList(parentId, list) {
			try {
				localStorage.setItem(threadsKey(parentId), JSON.stringify(list));
			} catch (_error) {}
			notifyThreads();
		}

		/** Add or update one thread, newest first, without duplicate children. */
		function upsertThread(parentId, entry) {
			if (typeof entry?.childId !== "string" || entry.childId === "") return readThreadList(parentId);
			const list = readThreadList(parentId).filter((item) => item.childId !== entry.childId);
			const previous = readThreadList(parentId).find((item) => item.childId === entry.childId);
			const next = [{
				childId: entry.childId,
				topic: entry.topic ?? previous?.topic ?? "",
				createdAt: previous?.createdAt ?? entry.createdAt ?? Date.now(),
				...(entry.boundary !== undefined && entry.boundary !== null ? { boundary: entry.boundary } : (previous?.boundary !== undefined ? { boundary: previous.boundary } : {})),
				...(entry.turn !== undefined && entry.turn !== null ? { turn: entry.turn } : (previous?.turn !== undefined ? { turn: previous.turn } : {}))
			}, ...list];
			saveThreadList(parentId, next);
			return next;
		}

		/**
		 * Rebuild list rows from the durable per-tab records. A tab record holds
		 * parentId/tabId/childId independently of the list projection, so pruning
		 * the list can never make a real thread unreachable.
		 */
		function recoverThreads(parentId) {
			if (typeof localStorage === "undefined") return 0;
			const prefix = STORE_PREFIX + parentId + ":";
			let recovered = 0;
			for (let index = 0; index < localStorage.length; index += 1) {
				const key = localStorage.key(index);
				if (typeof key !== "string" || !key.startsWith(prefix)) continue;
				const tabId = key.slice(prefix.length);
				if (tabId === "" || tabId.startsWith("threads.") || tabId === "hidden") continue;
				const record = readThread(parentId, tabId);
				if (record === null) continue;
				const list = readThreadList(parentId);
				const exists = list.some((item) => item.childId === record.childId);
				if (exists) continue;
				upsertThread(parentId, {
					childId: record.childId,
					topic: record.topic,
					boundary: record.boundary,
					turn: record.turn
				});
				recovered += 1;
			}
			return recovered;
		}

		function threadTopic(parentId, childId) {
			return readThreadList(parentId).find((item) => item.childId === childId)?.topic ?? "";
		}

		/** One panel per main conversation: the tab currently showing it. */
		function openTabKey(parentId) {
			return STORE_PREFIX + "open." + parentId;
		}

		function readOpenTab(parentId) {
			try {
				const value = localStorage.getItem(openTabKey(parentId));
				return typeof value === "string" ? value : "";
			} catch (_error) {
				return "";
			}
		}

		function rememberOpenTab(parentId, tabId) {
			try {
				localStorage.setItem(openTabKey(parentId), tabId);
			} catch (_error) {}
		}

		function forgetOpenTab(parentId) {
			try {
				localStorage.removeItem(openTabKey(parentId));
			} catch (_error) {}
		}

		/**
		 * A request for the live panel to switch thread (or start a new one).
		 * Navigation params only reach a tab that is being created, so later
		 * selections travel through this channel.
		 */
		const threadRequests = new Map();
		let threadRequestNonce = 0;

		function requestThread(parentId, childId) {
			threadRequestNonce += 1;
			threadRequests.set(parentId, {
				childId: typeof childId === "string" ? childId : "",
				nonce: threadRequestNonce
			});
			notifyThreads();
		}

		/**
		 * A stable, human label for one thread row. The host's own session title
		 * wins (DSH names sessions from their content); the thread's first
		 * question is the fallback, and only a nameless thread gets an ordinal.
		 */
		function threadLabel(item, index, total, hostTitle) {
			if (typeof hostTitle === "string" && hostTitle.trim() !== "") return hostTitle.trim();
			if (typeof item?.title === "string" && item.title.trim() !== "") return item.title.trim();
			if (typeof item?.topic === "string" && item.topic !== "") return item.topic;
			// Never invent a number: a nameless thread is identified by its age.
			const age = relativeTime(item?.createdAt);
			return sideTitleOf("") + (age === "" ? "" : " · " + age);
		}

		function relativeTime(value) {
			const time = typeof value === "number" ? value : Number.NaN;
			if (!Number.isFinite(time)) return "";
			const delta = Math.max(0, Date.now() - time);
			if (delta < 60_000) return t("justNow");
			const minutes = Math.floor(delta / 60_000);
			if (minutes < 60) return t("minutesAgo").replace("{n}", String(minutes));
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return t("hoursAgo").replace("{n}", String(hours));
			return t("daysAgo").replace("{n}", String(Math.floor(hours / 24)));
		}


		// ── thread naming ──────────────────────────────────────────────────

		// DSH already names a session durably from its content. A side thread is
		// an ordinary session, so its name follows the host instead of inventing
		// numbers: durable title → the thread's first question → the generic tab
		// label. The list is subscribed, so the name appears as soon as the host
		// projects it.
		function sessionTitleOf(ctx, childId) {
			if (typeof childId !== "string" || childId === "") return "";
			try {
				const row = ctx.sessions.list.getSnapshot()?.byId?.[childId];
				const title = typeof row?.title === "string" ? row.title.trim() : "";
				if (title !== "") return title;
			} catch (_error) {}
			return "";
		}

		/** Host title unless the fork merely inherited the parent's. */
		function effectiveHostTitle(ctx, parentId, childId) {
			const title = sessionTitleOf(ctx, childId);
			if (title === "") return "";
			return title === sessionTitleOf(ctx, parentId) ? "" : title;
		}

		/** Display name for one thread: host title, then first question, then tab label. */
		function threadTitleOf(ctx, parentId, childId, tabId) {
			const hostTitle = sessionTitleOf(ctx, childId);
			// A fork copies the parent's durable title; that is not a side-chat
			// name. Only a title the child earned itself (different from the parent)
			// is used.
			const parentTitle = sessionTitleOf(ctx, parentId);
			if (hostTitle !== "" && hostTitle !== parentTitle) return hostTitle;
			const stored = readThreadList(parentId).find((item) => item.childId === childId)?.topic
				|| threadTopic(parentId, childId)
				|| (typeof tabId === "string" ? (readThread(parentId, tabId)?.topic ?? "") : "");
			return sideTitleOf(stored);
		}

		/** Stable content fingerprint for "this exact hand-off was already inserted". */
		function seedHashOf(value) {
			const text = String(value ?? "");
			let hash = 5381;
			for (let index = 0; index < text.length; index += 1) {
				hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
			}
			return text.length === 0 ? "" : hash.toString(36) + ":" + text.length;
		}

		/** The first line of the first side question, bounded for a tab chip. */
		function topicOf(text) {
			const line = String(text ?? "").replace(/\s+/g, " ").trim();
			if (line === "") return "";
			return line.length > 32 ? line.slice(0, 32) + "…" : line;
		}

		function sideTitleOf(topic) {
			return typeof topic === "string" && topic !== "" ? topic : t("tab");
		}

		// ── session-list visibility ─────────────────────────────────────────

		// A side thread is an ordinary session, so the workspace list would show
		// every thread as a second conversation. Hide the ids this plugin owns;
		// the filter wraps the list's own useSessions feed only.
		const VISIBILITY_KEY = STORE_PREFIX + "hidden";

		function readHidden() {
			try {
				const value = JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? "[]");
				return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id !== "") : [];
			} catch (_error) {
				return [];
			}
		}

		let hiddenIds = new Set(readHidden());
		let pendingLists = [];
		const visibilityListeners = new Set();

		// useSyncExternalStore requires getSnapshot to return the same object
		// until the state actually changes. Building a fresh object here made
		// React re-render forever, which crashed the whole sidebar slot.
		let visibilityCache = { hidden: hiddenIds, pending: pendingLists };
		function visibilitySnapshot() {
			return visibilityCache;
		}

		function publishVisibility(nextHidden, nextPending) {
			hiddenIds = nextHidden;
			if (nextPending !== undefined) pendingLists = nextPending;
			visibilityCache = { hidden: hiddenIds, pending: pendingLists };
			for (const listener of [...visibilityListeners]) {
				try { listener(); } catch (_error) {}
			}
		}

		function subscribeVisibility(listener) {
			visibilityListeners.add(listener);
			return () => { visibilityListeners.delete(listener); };
		}

		function hideSession(...ids) {
			const next = new Set([...hiddenIds, ...readHidden(), ...ids.filter((id) => typeof id === "string" && id !== "")]);
			if (next.size === hiddenIds.size) return;
			try {
				localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...next]));
			} catch (_error) {}
			publishVisibility(next);
		}

		/** Promotion must make the thread reachable in the list again. */
		function showSession(id) {
			if (!hiddenIds.has(id)) return;
			const next = new Set([...hiddenIds]);
			next.delete(id);
			try {
				localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...next]));
			} catch (_error) {}
			publishVisibility(next);
		}

		/**
		 * A fork's list row can arrive before the RPC resolves. Everything known
		 * before the fork starts stays hidden until the release, so the row never
		 * flashes in the list first.
		 */
		function beginListWindow(list) {
			const known = new Set(Array.isArray(list?.ids) ? list.ids : Object.keys(list?.byId ?? {}));
			publishVisibility(hiddenIds, [...pendingLists, known]);
			return () => {
				publishVisibility(hiddenIds, pendingLists.filter((entry) => entry !== known));
			};
		}

		function isHiddenSession(id, snapshot) {
			if (snapshot.hidden.has(id)) return true;
			for (const known of snapshot.pending) if (!known.has(id)) return true;
			return false;
		}

		/** Filter only the list projection; bindings and stores stay intact. */
		function visibleSessionList(list, snapshot) {
			if (list === null || typeof list !== "object") return list;
			const source = list;
			if (!Array.isArray(source.ids) || source.byId === null || typeof source.byId !== "object") return list;
			// A running side thread must stay visible: the sidebar is the only place
			// that reports "this conversation is working". It disappears again as
			// soon as the turn settles.
			const hidden = (id) => isHiddenSession(id, snapshot) && source.byId[id]?.running !== true;
			if (!source.ids.some(hidden) && !Object.keys(source.byId).some(hidden)) return list;
			const ids = source.ids.filter((id) => !hidden(id));
			// Fail open: a display filter must never blank the entire sidebar.
			// If the projection would remove every row, keep the original list.
			if (ids.length === 0 && source.ids.length > 0) return list;
			return {
				...list,
				ids,
				byId: Object.fromEntries(Object.entries(source.byId).filter(([id]) => !hidden(id)))
			};
		}

		// ── host helpers ───────────────────────────────────────────────────

		function currentSessionId(ctx) {
			try {
				const current = ctx.sessions.list.getSnapshot()?.current;
				if (typeof current === "string" && current !== "") return current;
			} catch (_error) {}
			if (typeof document === "undefined") return "";
			const node = document.querySelector("[data-conversation-session]");
			return node?.dataset?.conversationSession ?? "";
		}

		function sidebarOf(ctx) {
			try {
				return ctx.get("sidebarRight");
			} catch (_error) {
				return undefined;
			}
		}

		// A tab that is already open ignores later navigation params, so a draft
		// or quote carried by a later selection waits here for the panel to take.
		const pendingDrafts = new Map();

		/**
		 * Bring the open panel back on screen. focus() reports nothing for an id
		 * that no longer exists, so the active tab is the proof of life; without
		 * that check a closed tab's remembered id would block every later open.
		 */
		function focusTab(ctx, tabId) {
			const sidebar = sidebarOf(ctx);
			if (sidebar === undefined || typeof sidebar.focus !== "function") return false;
			try {
				sidebar.focus(tabId);
				if (sidebar.isExpanded?.() === false) sidebar.toggleExpanded?.();
				if (typeof sidebar.active !== "function") return true;
				const active = sidebar.active();
				return active === undefined || active === null ? false : active.id === tabId;
			} catch (_error) {
				return false;
			}
		}

		/**
		 * Show the side chat of one main conversation: reuse the panel that is
		 * already open (switching its thread), and only create a tab when there
		 * is none. Without this every click forked another thread.
		 * @param options - the thread to show (omitted/"" = a brand-new thread)
		 */
		function openSideChat(ctx, parentId, draft, quote, options) {
			if (typeof parentId !== "string" || parentId === "") return false;
			const sidebar = sidebarOf(ctx);
			if (sidebar === undefined || typeof sidebar.openTab !== "function") return false;
			const childId = typeof options?.childId === "string" ? options.childId : "";
			if ((typeof draft === "string" && draft !== "") || (typeof quote === "string" && quote.trim() !== "")) {
				pendingDrafts.set(parentId, { draft: draft ?? "", quote: typeof quote === "string" ? quote : "" });
				notifyThreads();
			}
			// An open panel takes the switch itself; a new tab cannot appear twice.
			const openTab = readOpenTab(parentId);
			if (openTab !== "" && focusTab(ctx, openTab)) {
				if (options !== undefined) requestThread(parentId, childId);
				return true;
			}
			forgetOpenTab(parentId);
			try {
				sidebar.openTab(KIND, {
					params: {
						parentSessionId: parentId,
						...(childId !== "" ? { childId } : {}),
						...(typeof draft === "string" && draft !== "" ? { draft } : {}),
						...(typeof quote === "string" && quote.trim() !== "" ? { quote } : {})
					}
				});
				return true;
			} catch (error) {
				console.warn("[dsh-sidechat] openTab failed:", error);
				return false;
			}
		}

		// The native composer machine is an off-face host service; every use is
		// feature-checked and degrades to a clipboard copy.
		/**
		 * The side session's composer machine. A hidden child has no "current"
		 * scope, so the retained binding's own AgentContext is the address that
		 * resolves; the plain scope lookup stays as the first attempt.
		 */
		function sessionInput(ctx, sessionId) {
			let conversation;
			try {
				conversation = ctx.get("conversation");
			} catch (_error) {
				return null;
			}
			const resolver = conversation?.input;
			if (resolver === null || resolver === undefined || typeof resolver.for !== "function") return null;
			const addresses = [];
			try {
				const scope = ctx.sessions.scope(sessionId);
				if (scope !== undefined && scope !== null) addresses.push(scope);
			} catch (_error) {}
			try {
				const binding = ctx.sessions.binding(sessionId);
				if (binding?.ctx !== undefined && binding.ctx !== null) addresses.push(binding.ctx);
			} catch (_error) {}
			for (const address of addresses) {
				try {
					const input = resolver.for(address);
					if (input === null || input === undefined) continue;
					if (typeof input.setDraft !== "function") continue;
					if (typeof input.state?.getSnapshot !== "function") continue;
					return input;
				} catch (_error) {}
			}
			return null;
		}

		/**
		 * Put a selection in as DSH's own quote node when the composer offers it:
		 * the chip stays a UI object instead of Markdown text that the input box
		 * would show verbatim.
		 */
		/** How many quote nodes the composer currently holds (-1 when not projected). */
		function quoteCountOf(input) {
			try {
				const quotes = input?.state?.getSnapshot?.()?.quotes;
				return Array.isArray(quotes) ? quotes.length : -1;
			} catch (_error) {
				return -1;
			}
		}

		/**
		 * Insert one native quote node and prove it landed: the boolean return is
		 * only the dispatch ack, while the projection's quote count is the fact.
		 */
		function insertQuoteInto(ctx, sessionId, value) {
			const input = sessionInput(ctx, sessionId);
			if (input === null || typeof input.insertQuote !== "function") return false;
			const before = quoteCountOf(input);
			try {
				if (input.insertQuote(value) === false) return false;
			} catch (_error) {
				return false;
			}
			const after = quoteCountOf(input);
			if (before < 0 || after < 0) return true;
			return after === before + 1;
		}

		function appendToComposer(ctx, sessionId, value) {
			const input = sessionInput(ctx, sessionId);
			if (input === null) return false;
			try {
				const current = String(input.state.getSnapshot()?.draft ?? "");
				const next = current.trim() === "" ? value : current.replace(/\s+$/, "") + "\n\n" + value;
				input.setDraft(next);
				return true;
			} catch (_error) {
				return false;
			}
		}

		function acquireSession(ctx, sessionId) {
			try {
				if (typeof ctx.sessions.retain === "function") {
					const reference = ctx.sessions.retain(sessionId, { source: "dsh-sidechat" });
					if (reference !== undefined && reference !== null) return reference;
				}
			} catch (_error) {}
			try {
				const binding = ctx.sessions.binding(sessionId);
				if (binding === undefined) return null;
				return { binding, ready: Promise.resolve(binding), release() {} };
			} catch (_error) {
				return null;
			}
		}

		// ── model handoff ──────────────────────────────────────────────────

		/** Durable model selection projected on the session (no RPC needed). */
		function projectedModelSelection(ctx, sessionId) {
			try {
				const session = ctx.sessions.binding(sessionId)?.session;
				const face = session?.projections?.faceOf?.("modelSelection");
				const value = face?.getSnapshot?.();
				return value?.next ?? value?.lastUsed ?? undefined;
			} catch (_error) {
				return undefined;
			}
		}

		/** The remote session face that owns selectModel; probed, never assumed. */
		function remoteSession(ctx) {
			for (const name of ["remote.session", "remote"]) {
				let candidate;
				try {
					candidate = ctx.get(name);
				} catch (_error) {
					continue;
				}
				if (typeof candidate?.selectModel === "function") return candidate;
				if (typeof candidate?.session?.selectModel === "function") return candidate.session;
			}
			return undefined;
		}

		/** Copy the main thread's model/effort into the fresh side session. */
		async function syncModel(ctx, parentId, childId) {
			const selection = projectedModelSelection(ctx, parentId);
			if (selection === undefined || typeof selection.provider !== "string" || typeof selection.model !== "string") return false;
			const face = remoteSession(ctx);
			if (face === undefined) return false;
			try {
				const result = await face.selectModel({
					sessionId: childId,
					provider: selection.provider,
					model: selection.model,
					...(typeof selection.reasoningEffort === "string" ? { reasoningEffort: selection.reasoningEffort } : {})
				});
				return result?.ok === true;
			} catch (_error) {
				return false;
			}
		}

		// ── transcript helpers ─────────────────────────────────────────────

		function assistantText(node) {
			if (node?.kind !== "assistant" || node.interrupted === true) return "";
			const blocks = node.blocks ?? [];
			const out = blocks
				.filter((block) => block?.kind === "text" && typeof block.text === "string")
				.map((block) => block.text)
				.join("");
			return out.trim() === "" ? "" : out;
		}

		/** The last answer that belongs to this side thread, never inherited history. */
		function lastSideReply(snapshot, baselineSeq) {
			const nodes = snapshot?.nodes ?? [];
			let lastUser = baselineSeq ?? -Infinity;
			let reply = "";
			for (const node of nodes) {
				if (node?.kind === "user" && typeof node.seq === "number" && node.seq > lastUser) {
					lastUser = node.seq;
					reply = "";
				} else if (node?.kind === "assistant" && (node.seq ?? -Infinity) > lastUser) {
					const candidate = assistantText(node);
					if (candidate !== "") reply = candidate;
				}
			}
			return reply;
		}

		function baselineOf(snapshot) {
			let max = 0;
			for (const node of snapshot?.nodes ?? []) {
				if (node?.kind === "assistant" && typeof node.seq === "number" && node.seq > max) max = node.seq;
			}
			return max;
		}

		/**
		 * Durable fork cut: the host seeds a forked log with a session/end-seed
		 * event marked inherited, and everything at or before it belongs to the
		 * parent conversation. Reading it beats guessing from the loaded window,
		 * which is often still empty right after the fork resolves.
		 */
		function forkBoundaryOf(session) {
			try {
				const entries = session?.eventSource?.getSnapshot?.()?.entries ?? [];
				let boundary = null;
				for (const entry of entries) {
					const event = entry?.event;
					if (event?.type === "session/end-seed" && event?.data?.inherited === true) boundary = event.seq - 1;
				}
				return boundary;
			} catch (_error) {
				return null;
			}
		}

		/** Newest seq of any row in the loaded window, for when the cut is absent. */
		/** Newest turn covered by the inherited prefix (fork cut in turn space). */
		function lastTurnOf(snapshot) {
			let max = -1;
			for (const node of snapshot?.nodes ?? []) {
				if (typeof node?.turn === "number" && node.turn > max) max = node.turn;
			}
			try {
				for (const turn of snapshot?.turnTimings?.keys?.() ?? []) {
					if (typeof turn === "number" && turn > max) max = turn;
				}
			} catch (_error) {}
			return max >= 0 ? max : null;
		}

		function lastSeqOf(snapshot) {
			let max = 0;
			for (const node of snapshot?.nodes ?? []) {
				if (typeof node?.seq === "number" && node.seq > max) max = node.seq;
			}
			return max;
		}

		const QUOTE_HEADER = /^> \*\*(?:引用|Quoted) · .*\*\*$/;

		/**
		 * dsh-quote-cards hands its cards over as one Markdown draft
		 * ("> **引用 · 选中文字**" + quoted lines). The composer shows that text
		 * verbatim, so split it back into quote segments and text segments; the
		 * quotes then go in through the native quote node and render as chips.
		 */
		function parseQuoteCardDraft(value) {
			const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
			if (text === "") return [];
			const segments = [];
			for (const block of text.split(/\n{2,}/)) {
				const lines = block.split("\n");
				if (QUOTE_HEADER.test(lines[0] ?? "")) {
					const body = lines.slice(1)
						.map((line) => (line === ">" ? "" : (line.startsWith("> ") ? line.slice(2) : line)))
						.join("\n")
						.trim();
					if (body !== "") segments.push({ type: "quote", text: body });
					continue;
				}
				const plain = block.trim();
				if (plain !== "") segments.push({ type: "text", text: plain });
			}
			return segments;
		}

		function quoteSelection(value) {
			return value
				.split(/\r?\n/)
				.map((line) => (line === "" ? ">" : "> " + line))
				.join("\n");
		}

		/**
		 * Last-resort rendering when the composer cannot hold a quote node. The
		 * input box shows Markdown verbatim, so a ">" prefix there reads like a
		 * bug; a labelled block keeps the words and the attribution clear.
		 */
		function quoteFallback(value, label) {
			const body = String(value ?? "").trim();
			if (body === "") return "";
			return (typeof label === "string" && label !== "" ? label + "\n" : "") + body + "\n\n";
		}

		// ── conversation body ──────────────────────────────────────────────

		/**
		 * Last-line-of-defence transcript gate. The slot-level gate can miss when
		 * the host registers its renderers late or freezes the entries, so the
		 * wrapper also prunes by turn in the rendered DOM: every chat row carries
		 * data-chat-turn, and rows at or before the fork cut are hidden.
		 */
		function ChatView(props) {
			const hostRef = react.useRef(null);
			const boundaryTurn = react.useContext(SideBoundaryTurn);
			const boundarySeq = react.useContext(SideBoundary);
			react.useEffect(() => {
				const host = hostRef.current;
				if (host === null) return undefined;
				// Unknown turn cut on a forked thread: hide every row rather than risk
				// showing the parent transcript. The composer stays usable; the rows
				// appear once the cut is resolved.
				// Turn numbers may restart in a fork, so a turn-based cut can hide
				// the side chat's own first messages. Only the seq cut is used; when
				// it is unknown nothing is hidden (better than hiding the user's own
				// message).
				const cut = null;
				void boundaryTurn;
				void boundarySeq;
				if (cut === null) return undefined;
				const hide = () => {
					for (const row of host.querySelectorAll("[data-chat-turn]")) {
						const turn = Number(row.getAttribute("data-chat-turn"));
						if (Number.isFinite(turn) && turn <= cut) {
							row.style.display = "none";
							row.setAttribute("data-dsh-sidechat-inherited", "true");
						}
					}
				};
				hide();
				const observer = new MutationObserver(hide);
				observer.observe(host, { childList: true, subtree: true });
				return () => observer.disconnect();
			}, [boundaryTurn, boundarySeq]);
			return react.createElement(
				"div",
				{ className: "dsh-sidechat-session", ref: hostRef },
				props.renderSlot("conversation.session", { view: "chat" })
			);
		}

		function Content(props) {
			return props.renderFactorySlot(
				"conversation.content",
				{ variant: "embedded", phase: "active", hero: false },
				{ slots: { views: ChatView } }
			);
		}

		// ── panel ──────────────────────────────────────────────────────────

		function Panel(props) {
			useLocaleTick();
			const ctx = props.ctx;
			const info = props.useTabInfo();
			const tab = info.tab;
			const params = tab.navigation?.params ?? {};
			const parentId = typeof params.parentSessionId === "string" && params.parentSessionId !== ""
				? params.parentSessionId
				: props.sessionId;
			const draft = typeof params.draft === "string" ? params.draft : "";
			const quote = typeof params.quote === "string" ? params.quote.trim() : "";
			// A draft/quote that arrives while the tab is already open is not part
			// of its navigation params; the panel subscribes to pendingDrafts.
			react.useSyncExternalStore(subscribeThreads, () => pendingDrafts.get(parentId)?.draft ?? "");
			const pending = pendingDrafts.get(parentId);
			const carriedDraft = draft !== "" ? draft : (pending?.draft ?? "");
			const carriedQuote = quote !== "" ? quote : (pending?.quote ?? "");

			const initial = (typeof params.childId === "string" && params.childId !== "")
				? { childId: params.childId }
				: readThread(parentId, tab.id);
			const [childId, setChildId] = react.useState(initial?.childId ?? "");
			const [reference, setReference] = react.useState(null);
			const [forkError, setForkError] = react.useState("");
			const [status, setStatus] = react.useState("");
			const [boundary, setBoundary] = react.useState(null);
			const [boundaryTurn, setBoundaryTurn] = react.useState(null);
			const [storedThreads, setThreads] = react.useState(() => readThreadList(parentId));
			// An empty thread is an implementation detail of "the panel was opened":
			// it has no question yet, so it must not show up as a side chat row.
			const threads = react.useMemo(() => {
				const byId = ctx.sessions.list.getSnapshot()?.byId ?? {};
				return storedThreads.filter((item) =>
					byId[item.childId] !== undefined
					&& (
						item.childId === childId
						|| (typeof item.topic === "string" && item.topic !== "")
						|| effectiveHostTitle(ctx, parentId, item.childId) !== ""
					)
				);
			}, [storedThreads, childId, ctx, parentId]);
			// Recovery: the thread list is a projection, while the durable tab
			// records (one per opened panel) keep the child id even if the list was
			// pruned by an older build. Merge them back before showing anything.
			react.useEffect(() => {
				const recovered = recoverThreads(parentId);
				if (recovered === 0) return;
				setThreads(readThreadList(parentId));
			}, [parentId]);
			const [switcher, setSwitcher] = react.useState(false);
			const [menuOpen, setMenuOpen] = react.useState(false);
			const forking = react.useRef(false);
			const draftSent = react.useRef(false);
			const quoteSent = react.useRef(false);
			const baseline = react.useRef(null);

			// A tab created straight onto an existing thread (header picker) records
			// that binding so a reload reattaches to the same child.
			react.useEffect(() => {
				if (childId === "") return;
				if (readThread(parentId, tab.id)?.childId === childId) return;
				writeThread(parentId, tab.id, { childId, topic: threadTopic(parentId, childId), seeded: true });
			}, [parentId, tab.id, childId]);

			// The panel owns the "one side chat per conversation" slot: reopening
			// or picking a thread from the header focuses this tab, not a new one.
			react.useEffect(() => {
				rememberOpenTab(parentId, tab.id);
			}, [parentId, tab.id]);

			const threadRequest = react.useSyncExternalStore(
				subscribeThreads,
				() => threadRequests.get(parentId) ?? null,
				() => null
			);
			const handledRequest = react.useRef(0);

			// The panel mounting is the first moment the host is guaranteed to have
			// registered its chat-node renderers, so re-apply the gate here.
			react.useEffect(() => {
				patchChatNodes();
				const timers = [120, 600, 1500, 4000].map((delay) => setTimeout(patchChatNodes, delay));
				return () => { for (const timer of timers) clearTimeout(timer); };
			}, [childId]);

			// The panel mounting is the first moment the host is guaranteed to have
			// registered its chat-node renderers, so re-apply the gate here.
			react.useEffect(() => {
				patchChatNodes();
				const timers = [120, 600, 1500, 4000].map((delay) => setTimeout(patchChatNodes, delay));
				return () => { for (const timer of timers) clearTimeout(timer); };
			}, [childId]);

			// A dedicated thread is a fork of the main conversation. The fork keeps
			// the completed history but none of the main line's later turns.
			react.useEffect(() => {
				if (childId !== "" || forking.current) return undefined;
				forking.current = true;
				let cancelled = false;
				const release = beginListWindow(ctx.sessions.list.getSnapshot());
				// A side chat is a BRANCH of the main conversation: it must share that
				// conversation's completed history, so it is a fork, not an unrelated
				// session. The inherited prefix is never rendered (see the boundary
				// gates); only the turns this side chat adds are shown.
				const forkSnapshot = ctx.sessions.binding(parentId)?.session?.getSnapshot?.();
				const parentCut = lastSeqOf(forkSnapshot);
				const parentTurn = lastTurnOf(forkSnapshot);
				const createEmpty = () => {
					const create = typeof ctx.sessions.create === "function" ? ctx.sessions.create : null;
					if (create === null) return Promise.reject(new Error("host exposes neither fork nor create"));
					const row = ctx.sessions.list.getSnapshot()?.byId?.[parentId];
					const cwd = typeof row?.cwd === "string" ? row.cwd : undefined;
					return create.call(ctx.sessions, cwd === undefined ? {} : { cwd });
				};
				ctx.sessions.fork({ sessionId: parentId }).catch((error) => {
					// A conversation with no completed turn cannot be forked; start an
					// empty related session instead of failing the panel.
					if (typeof ctx.sessions.create === "function") return createEmpty();
					throw error;
				}).then((id) => {
					// Persist even when this panel already unmounted: the tab must
					// reattach to the same child instead of forking an orphan.
					writeThread(parentId, tab.id, {
						childId: id,
						boundary: parentCut > 0 ? parentCut : null,
						turn: parentTurn,
						fresh: false
					});
					hideSession(id);
					release();
					if (cancelled) return;
					setChildId(id);
				}).catch((error) => {
					release();
					if (cancelled) return;
					setForkError(error instanceof Error ? error.message : String(error));
				});
				return () => { cancelled = true; release(); };
			}, [ctx, parentId, tab.id, childId]);

			// Retain is the ownership face; binding is the documented fallback. The
			// child may take a beat to appear in the list, hence the short retry.
			react.useEffect(() => {
				if (childId === "") return undefined;
				let cancelled = false;
				let timer;
				let held = null;
				const attach = () => {
					if (cancelled) return;
					const acquired = acquireSession(ctx, childId);
					if (acquired === null) {
						timer = setTimeout(attach, 300);
						return;
					}
					held = acquired;
					setReference(acquired);
					Promise.resolve(acquired.ready).then(() => {
						if (cancelled) return;
						const child = acquired.binding?.session;
						const settle = (value) => {
							if (cancelled || baseline.current !== null) return;
							baseline.current = value;
							setBoundary(value);
							// Give the DOM gate the turn-space cut too. It is derived from
							// the same rows so both gates cut at exactly the same place.
							const snapshot = child?.getSnapshot?.();
							let turn = null;
							for (const node of snapshot?.nodes ?? []) {
								if (typeof node?.seq !== "number" || node.seq > value) continue;
								if (typeof node?.turn === "number" && (turn === null || node.turn > turn)) turn = node.turn;
							}
							if (turn !== null) setBoundaryTurn(turn);
							writeThread(parentId, tab.id, { boundary: value, ...(turn === null ? {} : { turn }) });
						};
						// A restored thread already knows its cut; never recompute it. A
						// recorded 0 means "unknown", not "no inherited history".
						const record = readThread(parentId, tab.id);
						if (record?.fresh === true) {
							// Nothing was inherited, so everything the session owns is new.
							setBoundaryTurn(null);
							settle(0);
							return;
						}
						if (typeof record?.turn === "number" && record.turn >= 0) setBoundaryTurn(record.turn);
						const remembered = record?.boundary;
						if (typeof remembered === "number" && remembered > 0) {
							settle(remembered);
							return;
						}
						const marker = forkBoundaryOf(child);
						if (marker !== null) {
							settle(marker);
							return;
						}
						// No marker in the loaded window yet: page the child's own
						// history back until the fork seed is inside it. The seed is the
						// only authoritative cut; guessing from a partial window would
						// leave part of the parent transcript visible.
						const resolveCut = async () => {
							for (let pages = 0; pages < 40; pages += 1) {
								if (cancelled || baseline.current !== null) return;
								const snapshot = child?.getSnapshot?.();
								if (snapshot?.hasMore === false) break;
								if (typeof child?.loadOlder !== "function") break;
								try {
									await child.loadOlder();
								} catch (_error) {
									break;
								}
							}
							if (cancelled || baseline.current !== null) return;
							const marker = forkBoundaryOf(child);
							if (marker !== null) {
								settle(marker);
								return;
							}
							const snapshot = child?.getSnapshot?.();
							// Only a complete window is safe: a partial one would cut in the
							// middle of inherited history and leak the rest.
							// Deliberately no lastSeqOf() fallback: the newest row may be the
							// side chat's own first message, and using it as the cut would
							// hide exactly what the user just sent. If no durable cut can be
							// found, settle at 0 (hide nothing) so the panel stays usable.
							if (!cancelled && baseline.current === null) settle(0);
						};
						void resolveCut();
					}).catch((error) => {
						if (!cancelled) setForkError(error instanceof Error ? error.message : String(error));
					});
				};
				attach();
				return () => {
					cancelled = true;
					if (timer !== undefined) clearTimeout(timer);
					try { held?.release?.(); } catch (_error) {}
				};
			}, [ctx, childId]);

			// fork inherits the agent preset but not the model selection: copy the
			// main conversation's provider/model/effort once, without overwriting a
			// choice the user already made in this thread.
			react.useEffect(() => {
				if (childId === "" || reference === null) return undefined;
				let cancelled = false;
				Promise.resolve(reference.ready).then(() => {
					if (!cancelled) return syncModel(ctx, parentId, childId);
					return undefined;
				}).catch(() => {});
				return () => { cancelled = true; };
			}, [ctx, parentId, childId, reference]);

			// A side thread can become the main conversation (a session notification
			// opens it, or "open as chat"). Mounting a second conversation for the
			// session already filling the main column gives the host two composers
			// on one input machine, and this panel's composer then stops accepting
			// text. Never mount it twice: show the hand-off state instead.
			const listSnapshot = react.useSyncExternalStore(
				(notify) => ctx.sessions.list.subscribe(notify),
				() => ctx.sessions.list.getSnapshot(),
				() => ctx.sessions.list.getSnapshot()
			);
			const childIsMain = childId !== "" && (listSnapshot?.current === childId || currentSessionId(ctx) === childId);

			const session = reference?.binding?.session;
			const sessionSnapshot = react.useSyncExternalStore(
				react.useCallback((notify) => session?.subscribe?.(notify) ?? (() => {}), [session]),
				() => session?.getSnapshot?.() ?? null
			);

			// Name the tab after the thread's first question, once, without
			// overwriting a topic restored from storage.
			react.useEffect(() => {
				if (sessionSnapshot === null || childId === "") return;
				const record = readThread(parentId, tab.id);
				if (record?.topic) return;
				const floor = baseline.current ?? 0;
				const first = (sessionSnapshot.nodes ?? []).find((node) =>
					node?.kind === "user" && typeof node.seq === "number" && node.seq > floor);
				if (first === undefined) return;
				const value = (first.content ?? [])
					.filter((block) => block?.type === "text" && typeof block.text === "string")
					.map((block) => block.text)
					.join(" ");
				const topic = topicOf(value);
				if (topic === "") return;
				writeThread(parentId, tab.id, { topic });
				setThreads(upsertThread(parentId, { childId, topic }));
			}, [sessionSnapshot, childId, parentId, tab.id]);

			// A draft handed over at open time has to wait for the child composer.
			// Quote cards are split back into segments so the quoted parts become
			// native chips instead of Markdown text in the input box.
			react.useEffect(() => {
				if (carriedDraft === "" || childId === "") return undefined;
				const draftHash = seedHashOf(carriedDraft);
				// Only the same hand-off is skipped again; a new one still lands.
				if (readThread(parentId, tab.id)?.seedHash === draftHash) return undefined;
				let cancelled = false;
				let timer;
				let tries = 0;
				const segments = parseQuoteCardDraft(carriedDraft);
				const quoteSegments = segments.filter((segment) => segment.type === "quote");
				const textSegments = segments.filter((segment) => segment.type === "text");
				const finish = () => {
					draftSent.current = true;
					pendingDrafts.delete(parentId);
					writeThread(parentId, tab.id, { seeded: true, seedHash: draftHash });
				};
				const attempt = () => {
					if (cancelled) return;
					if (quoteSegments.length > 0) {
						const input = sessionInput(ctx, childId);
						if (input !== null && typeof input.insertQuote === "function") {
							const inserted = quoteSegments.every((segment) => insertQuoteInto(ctx, childId, segment.text));
							if (inserted) {
								for (const segment of textSegments) appendToComposer(ctx, childId, segment.text);
								finish();
								return;
							}
						}
						tries += 1;
						// The child composer can mount well after the fork resolves;
						// give it up to ~10s before falling back to Markdown.
						if (tries < 40) {
							timer = setTimeout(attempt, 250);
							return;
						}
						// Last resort: keep the words so no content is lost, but drop the
						// Markdown markers the composer would show verbatim.
						const readable = quoteSegments
							.map((segment) => quoteFallback(segment.text, T.quoteLabel))
							.join("")
							+ textSegments.map((segment) => segment.text).join("\n\n");
						if (appendToComposer(ctx, childId, readable)) finish();
						return;
					}
					if (appendToComposer(ctx, childId, carriedDraft)) {
						finish();
						return;
					}
					timer = setTimeout(attempt, 250);
				};
				attempt();
				return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
			}, [ctx, childId, carriedDraft, parentId, tab.id]);

			// A selection carried from the conversation becomes a native quote chip.
			// After a short grace period, fall back to the Markdown blockquote so the
			// text is never lost on a host without insertQuote.
			react.useEffect(() => {
				if (carriedQuote === "" || childId === "") return undefined;
				const quoteHash = seedHashOf(carriedQuote);
				if (readThread(parentId, tab.id)?.seedHash === quoteHash) return undefined;
				let cancelled = false;
				let timer;
				let tries = 0;
				const finish = () => {
					quoteSent.current = true;
					pendingDrafts.delete(parentId);
					writeThread(parentId, tab.id, { seeded: true, seedHash: quoteHash });
				};
				const attempt = () => {
					if (cancelled) return;
					if (insertQuoteInto(ctx, childId, carriedQuote)) {
						finish();
						return;
					}
					tries += 1;
					// The side composer mounts after the fork resolves; keep trying
					// long enough for it, then keep the words rather than the marker.
					if (tries < 40) {
						timer = setTimeout(attempt, 250);
						return;
					}
					if (appendToComposer(ctx, childId, quoteFallback(carriedQuote, T.quoteLabel))) finish();
				};
				attempt();
				return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
			}, [ctx, childId, carriedQuote, parentId, tab.id]);

			// Host-projected session titles arrive after the first turn; the list
			// subscription is what turns "侧聊" into the real name.
			react.useSyncExternalStore(
				(notify) => ctx.sessions.list.subscribe(notify),
				() => ctx.sessions.list.getSnapshot(),
				() => ctx.sessions.list.getSnapshot()
			);

			const parent = ctx.sessions.binding(parentId)?.session;
			const parentSnapshot = react.useSyncExternalStore(
				react.useCallback((notify) => parent?.subscribe?.(notify) ?? (() => {}), [parent]),
				() => parent?.getSnapshot?.() ?? null
			);

			const bringBack = () => {
				const value = lastSideReply(sessionSnapshot, baseline.current ?? 0);
				if (value === "") {
					setStatus(T.emptyReply);
					return;
				}
				if (appendToComposer(ctx, parentId, value)) {
					setStatus(T.broughtBack);
					return;
				}
				try {
					void navigator.clipboard?.writeText(value);
					setStatus(T.broughtBackClipboard);
				} catch (_error) {
					setStatus(T.broughtBackClipboard);
				}
			};

			const openAsSession = () => {
				if (childId === "") return;
				showSession(childId);
				try { ctx.sessions.open(childId); } catch (error) { setStatus(String(error)); }
			};

			/** Switch the panel to another thread of this same main conversation. */
			const selectThread = (id) => {
				if (typeof id !== "string" || id === "" || id === childId) {
					setSwitcher(false);
					return;
				}
				writeThread(parentId, tab.id, { childId: id, topic: threadTopic(parentId, id), seeded: true, boundary: null });
				baseline.current = null;
				draftSent.current = true;
				quoteSent.current = true;
				setBoundary(null);
				setBoundaryTurn(null);
				setReference(null);
				setStatus("");
				setForkError("");
				setChildId(id);
				setSwitcher(false);
			};

			// Apply a switch requested by the header picker or a sibling plugin.
			react.useEffect(() => {
				if (threadRequest === null || threadRequest.nonce === handledRequest.current) return;
				handledRequest.current = threadRequest.nonce;
				if (threadRequest.childId === childId) return;
				if (threadRequest.childId === "") startThread();
				else selectThread(threadRequest.childId);
			}, [threadRequest, childId]);

			/** Drop every side chat this plugin remembers, then start over. */
			const clearAll = () => {
				setMenuOpen(false);
				const confirm = typeof window !== "undefined" && typeof window.confirm === "function"
					? window.confirm
					: null;
				if (confirm !== null && !confirm(T.clearConfirm)) return;
				const removed = clearAllSideChatData();
				setThreads([]);
				baseline.current = null;
				draftSent.current = false;
				quoteSent.current = false;
				setBoundary(null);
				setBoundaryTurn(null);
				setReference(null);
				setStatus("");
				setForkError("");
				setChildId("");
				forking.current = false;
				setStatus(T.clearDone.replace("{n}", String(removed)));
			};

			/** A new thread means a new fork plus its own list entry. */
			const startThread = () => {
				setSwitcher(false);
				setMenuOpen(false);
				// Opening the panel already forked a thread. If it has no question
				// yet, "new chat" means that same empty thread — forking again would
				// leave abandoned children behind for nothing.
				const record = readThread(parentId, tab.id);
				const used = record?.childId ? record.topic !== "" || sessionTitleOf(ctx, record.childId) !== "" : false;
				setForkError("");
				setStatus("");
				if (!used) return;
				baseline.current = null;
				draftSent.current = false;
				setBoundary(null);
				setBoundaryTurn(null);
				setReference(null);
				setChildId("");
				forking.current = false;
			};

			return react.createElement(
				"div",
				{ className: "dsh-sidechat-root", "data-dsh-sidechat": true },
				react.createElement(
					"div",
					{ className: "dsh-sidechat-bar" },
					react.createElement(
						"button",
						{
							type: "button",
							className: "dsh-sidechat-title",
							title: T.switchThread,
							"aria-expanded": switcher,
							onClick: () => { setSwitcher((open) => !open); setMenuOpen(false); }
						},
						react.createElement("span", { className: "dsh-sidechat-title-text" }, (() => {
							const index = threads.findIndex((item) => item.childId === childId);
							return index < 0 ? T.tab : threadLabel(threads[index], index, threads.length, sessionTitleOf(ctx, threads[index].childId));
						})()),
						react.createElement("span", { className: "dsh-sidechat-caret", "aria-hidden": "true" }, "▾")
					),
					react.createElement(
						"div",
						{ className: "dsh-sidechat-menu-wrap" },
						react.createElement("button", {
							type: "button",
							className: "dsh-sidechat-more",
							title: T.more,
							"aria-label": T.more,
							"aria-expanded": menuOpen,
							onClick: () => { setMenuOpen((open) => !open); setSwitcher(false); }
						}, "⋯"),
						menuOpen ? react.createElement(
							"div",
							{ className: "dsh-sidechat-menu", role: "menu" },
							react.createElement("button", {
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-item",
								onClick: () => { setMenuOpen(false); startThread(); }
							}, T.newThread),
							react.createElement("button", {
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-item",
								disabled: sessionSnapshot === null,
								onClick: () => { setMenuOpen(false); bringBack(); }
							}, T.bringBack),
							react.createElement("button", {
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-item",
								disabled: childId === "",
								onClick: () => { setMenuOpen(false); openAsSession(); }
							}, T.openAsSession),
							react.createElement("button", {
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-item",
								onClick: () => {
									setMenuOpen(false);
									try { ctx.sessions.open(parentId); } catch (_error) {}
								}
							}, parentSnapshot?.running === true ? T.parentRunning : T.parentIdle),
							react.createElement("button", {
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-item dsh-sidechat-menu-danger",
								onClick: clearAll
							}, T.clearAll)
						) : null
					)
				),
				switcher ? react.createElement(
					"div",
					{ className: "dsh-sidechat-switcher", role: "menu" },
					react.createElement(
						"button",
						{
							type: "button",
							role: "menuitem",
							className: "dsh-sidechat-thread dsh-sidechat-thread-new",
							onClick: () => { setSwitcher(false); startThread(); }
						},
						"+ " + T.newThread
					),
					threads.map((item, index) => react.createElement(
						"button",
						{
							key: item.childId,
							type: "button",
							role: "menuitem",
							className: "dsh-sidechat-thread" + (item.childId === childId ? " is-current" : ""),
							onClick: () => selectThread(item.childId)
						},
						react.createElement("span", { className: "dsh-sidechat-thread-topic" }, threadLabel(item, index, threads.length, sessionTitleOf(ctx, item.childId))),
						react.createElement("span", { className: "dsh-sidechat-thread-time" }, relativeTime(item.createdAt))
					)),
				) : null,
				status !== "" ? react.createElement("div", { className: "dsh-sidechat-status", role: "status" }, status) : null,
				forkError !== "" ? react.createElement(
					"div",
					{ className: "dsh-sidechat-error", role: "alert" },
					react.createElement("strong", null, T.forkError),
					react.createElement("p", null, forkError),
					react.createElement("p", { className: "dsh-sidechat-hint" }, T.forkHint),
					react.createElement("button", {
						type: "button",
						className: "dsh-sidechat-action",
						onClick: () => { setForkError(""); setChildId(""); forking.current = false; }
					}, T.retry)
				) : null,
				childIsMain
					? react.createElement(
						"div",
						{ className: "dsh-sidechat-handoff" },
						react.createElement("p", { className: "dsh-sidechat-handoff-title" }, T.childIsMain),
						react.createElement("p", { className: "dsh-sidechat-handoff-hint" }, T.childIsMainHint)
					)
					: reference === null || boundary === null
					? react.createElement("div", { className: "dsh-sidechat-loading" }, T.preparing)
					: react.createElement(
						"div",
						{ className: "dsh-sidechat-conversation" },
						react.createElement(
							SideBoundary.Provider,
							{ value: boundary },
							react.createElement(
								SideBoundaryTurn.Provider,
								{ value: boundaryTurn },
								react.createElement(
									props.SessionProvider,
									{ session: reference },
									props.renderSlot("dshside.conversation", {})
								)
							)
						)
					)
			);
		}

		// ── inherited-history gate ─────────────────────────────────────────

		// A fork carries the whole parent transcript in its log so the model has
		// the context. Codex does not show that copy in the side thread, so every
		// chat row at or before the fork boundary renders nothing here. The gate
		// is a React context, not a global: the main conversation has no provider
		// and renders its rows unchanged.
		const SideBoundary = react.createContext(null);
		const SideBoundaryTurn = react.createContext(undefined);

		function isInheritedNode(node, boundary) {
			return boundary !== null && boundary !== undefined
				&& typeof node?.seq === "number"
				&& node.seq <= boundary;
		}

		/**
		 * Wrap every registered chat-node renderer. Keyed entries are replaced in
		 * place and restored on dispose; unknown shapes keep the original row.
		 */
		/** Live re-patch hooks installed by the registration below. */
		const gatePatchers = new Set();

		/** Re-apply the inherited-row gate now (idempotent; called on panel mount). */
		function patchChatNodes() {
			for (const patch of gatePatchers) {
				try { patch(); } catch (_error) {}
			}
		}

		function registerChatNodeGate(ctx) {
			const slots = ctx.slots;
			if (typeof slots?.entries !== "function" || typeof slots?.subscribe !== "function" || typeof slots?.inject !== "function") return () => {};
			try {
				return slots.inject("conversation.chat.node", () => {
					const patched = new Map();
					const patch = () => {
						for (const entry of slots.entries("conversation.chat.node")) {
							if (patched.has(entry) || typeof entry.component !== "function") continue;
							const Original = entry.component;
							function Gated(props) {
								const boundary = react.useContext(SideBoundary);
								if (isInheritedNode(props?.node, boundary)) return null;
								return react.createElement(Original, props);
							}
							try {
								entry.component = Gated;
								patched.set(entry, { original: Original, wrapped: Gated });
							} catch (_error) {}
						}
					};
					patch();
					const off = slots.subscribe("conversation.chat.node", patch);
					gatePatchers.add(patch);
					// The Chat view may register its node renderers only when the
					// conversation first mounts — long after this plugin applies. The
					// panel also calls patchChatNodes() on mount, and these bounded
					// retries cover the early cases.
					const timers = [0, 60, 250, 1000, 3000].map((delay) => setTimeout(patch, delay));
					return () => {
						gatePatchers.delete(patch);
						for (const timer of timers) clearTimeout(timer);
						off();
						for (const [entry, value] of patched) {
							if (entry.component === value.wrapped) entry.component = value.original;
						}
					};
				});
			} catch (error) {
				console.warn("[dsh-sidechat] inherited-history gate unavailable:", error);
				return () => {};
			}
		}

		// ── tab title ──────────────────────────────────────────────────────

		function readTopic(parentId, tabId) {
			return readThread(parentId, tabId)?.topic ?? "";
		}

		/** The chip shows the thread's first question as soon as it exists. */
		function TabTitle(props) {
			const info = props.useTabInfo();
			const params = info.tab.navigation?.params ?? {};
			const parentId = typeof params.parentSessionId === "string" && params.parentSessionId !== ""
				? params.parentSessionId
				: props.sessionId;
			const tabId = info.tab.id;
			const ctx = props.ctx;
			const getLabel = react.useCallback(() => {
				const childId = readThread(parentId, tabId)?.childId ?? "";
				return threadTitleOf(ctx, parentId, childId, tabId);
			}, [ctx, parentId, tabId]);
			react.useSyncExternalStore(subscribeThreads, getLabel, getLabel);
			react.useSyncExternalStore(
				(notify) => ctx.sessions.list.subscribe(notify),
				() => ctx.sessions.list.getSnapshot(),
				() => ctx.sessions.list.getSnapshot()
			);
			return getLabel();
		}

		// ── session-list filter ────────────────────────────────────────────

		/**
		 * DSH has no per-session hide API, but the workspace list reads its rows
		 * from one slot entry's own useSessions feed. Wrapping that entry replaces
		 * only the list projection: bindings, stores and every other consumer keep
		 * the full state.
		 */
		function registerSessionListFilter(ctx) {
			const slots = ctx.slots;
			if (slots === null || slots === undefined) return () => {};
			if (typeof slots.entries !== "function" || typeof slots.subscribe !== "function" || typeof slots.inject !== "function") return () => {};
			const SLOT = "sidebar.workspaces";
			try {
				return slots.inject(SLOT, () => {
					const originals = new Map();
					const patch = () => {
						for (const entry of slots.entries(SLOT)) {
							if (originals.has(entry) || typeof entry.component !== "function") continue;
							// The workspace browser is the entry that declares this child.
							if (entry.children?.["sidebar.workspaces.directoryFlow"] === undefined) continue;
							const Original = entry.component;
							function Filtered(props) {
								const useSessions = props.useSessions;
								if (typeof useSessions !== "function") return react.createElement(Original, props);
								const all = useSessions((value) => value);
								const snapshot = react.useSyncExternalStore(subscribeVisibility, visibilitySnapshot, visibilitySnapshot);
								const visible = react.useMemo(
									() => visibleSessionList(all, snapshot),
									[all, snapshot.hidden, snapshot.pending]
								);
								const projected = react.useCallback((selector) => selector(visible), [visible]);
								return react.createElement(Original, { ...props, useSessions: projected });
							}
							try {
								entry.component = Filtered;
								originals.set(entry, { original: Original, wrapped: Filtered });
							} catch (_error) {
								// Frozen registries keep the native list.
							}
						}
					};
					patch();
					const off = slots.subscribe(SLOT, patch);
					// Never register a placeholder into SLOT itself: it is a single
					// slot, so a higher-priority entry returning null would replace
					// the WorkspaceBrowser and blank the whole sidebar.
					return () => {
						off();
						for (const [entry, value] of originals) {
							if (entry.component === value.wrapped) entry.component = value.original;
						}
					};
				});
			} catch (error) {
				console.warn("[dsh-sidechat] list filter unavailable:", error);
				return () => {};
			}
		}

		// ── discovery seats ────────────────────────────────────────────────

		/**
		 * Header entry: with side chats already recorded, the first click asks
		 * which thread to resume instead of silently forking another one. Only a
		 * conversation with no side chat opens a fresh thread directly.
		 */
		function HeaderButton(props) {
			useLocaleTick();
			const ctx = props.ctx;
			// Keep the entry in step with session switches and with new threads.
			react.useSyncExternalStore(
				(notify) => ctx.sessions.list.subscribe(notify),
				() => ctx.sessions.list.getSnapshot()
			);
			react.useSyncExternalStore(subscribeThreads, () => readThreadList(currentSessionId(ctx)).length, () => 0);
			const [picker, setPicker] = react.useState(null);
			const rootRef = react.useRef(null);
			const sessionId = currentSessionId(ctx);

			// Hooks stay unconditional: the session can appear after this mounts.
			react.useEffect(() => {
				if (picker === null) return undefined;
				const onPointerDown = (event) => {
					const root = rootRef.current;
					if (root !== null && event.target instanceof Node && !root.contains(event.target)) setPicker(null);
				};
				const onKeyDown = (event) => { if (event.key === "Escape") setPicker(null); };
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [picker]);

			const openPicker = (event) => {
				recoverThreads(sessionId);
				// Only threads that became a real chat count as history: opening the
				// panel used to leave an empty child behind, and those must not turn
				// the first click into a picker full of identical rows.
				// The picker lists real threads only: an existing child session, and
				// either a first question or a title the child earned itself. A fork
				// that merely inherited the parent title is not a usable name.
				const byId = ctx.sessions.list.getSnapshot()?.byId ?? {};
				const items = readThreadList(sessionId).filter((item) =>
					byId[item.childId] !== undefined
					&& (
						(typeof item.topic === "string" && item.topic !== "")
						|| effectiveHostTitle(ctx, sessionId, item.childId) !== ""
					)
				);
				if (items.length === 0) {
					openSideChat(ctx, sessionId);
					return;
				}
				if (picker !== null) {
					setPicker(null);
					return;
				}
				const rect = event.currentTarget?.getBoundingClientRect?.();
				setPicker({
					items,
					top: rect === undefined ? 48 : Math.round(rect.bottom + 6),
					right: rect === undefined ? 16 : Math.round(Math.max(12, window.innerWidth - rect.right))
				});
			};

			const pick = (childId) => {
				setPicker(null);
				openSideChat(ctx, sessionId, "", "", { childId });
			};

			if (sessionId === "") return null;

			return react.createElement(
				"span",
				{ className: "dsh-sidechat-header-wrap", ref: rootRef },
				react.createElement(
					"button",
					{
						type: "button",
						className: "dsh-sidechat-header",
						title: T.headerTitle,
						"aria-label": T.headerTitle,
						"aria-haspopup": "menu",
						"aria-expanded": picker !== null,
						onClick: openPicker
					},
					T.header
				),
				picker === null ? null : react.createElement(
					"div",
					{
						className: "dsh-sidechat-picker",
						role: "menu",
						style: { top: picker.top + "px", right: picker.right + "px" }
					},
					react.createElement("div", { className: "dsh-sidechat-picker-head" }, T.pickerTitle),
					react.createElement(
						"button",
						{ type: "button", role: "menuitem", className: "dsh-sidechat-picker-new", onClick: () => pick("") },
						"+ " + T.newThread
					),
					react.createElement(
						"div",
						{ className: "dsh-sidechat-picker-list" },
						picker.items.map((item, index) => react.createElement(
							"button",
							{
								key: item.childId,
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-picker-item",
								onClick: () => pick(item.childId)
							},
							react.createElement("span", { className: "dsh-sidechat-picker-topic" }, threadLabel(
								item,
								index,
								picker.items.length,
								effectiveHostTitle(ctx, sessionId, item.childId)
							)),
							react.createElement("span", { className: "dsh-sidechat-picker-time" }, relativeTime(item.createdAt))
						))
					),
					picker.items.length === 0
						? react.createElement("div", { className: "dsh-sidechat-picker-empty" }, T.threadEmpty)
						: null
				)
			);
		}

		function SelectionAsk(props) {
			useLocaleTick();
			const ctx = props.ctx;
			return react.createElement(
				"button",
				{
					type: "button",
					className: "dsh-sidechat-selection",
					"aria-label": T.selection,
					onPointerDown: (event) => event.preventDefault(),
					onClick: () => {
						const selected = typeof props.readText === "function" ? props.readText() : null;
						if (selected === null || String(selected).trim() === "") {
							props.dismiss?.();
							return;
						}
						if (openSideChat(ctx, props.sessionId, "", String(selected).trim())) {
							props.clearSelection?.();
							props.dismiss?.();
						}
					}
				},
				T.selection
			);
		}

		// ── styles ─────────────────────────────────────────────────────────

		const CSS = [
			// A side panel is narrower than the main column: tighten the host
			// conversation's own spacing variables instead of restyling its DOM.
			".dsh-sidechat-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,transparent);--dsh-content-font-size:13px;--dsh-content-font-delta:-1px;--dsh-content-font-size-secondary:12px;--dsh-composer-side-clearance:10px;--dsh-composer-stack-gap:6px}",
			".dsh-sidechat-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}",
			// Codex-style header: one quiet title control and one overflow menu.
			".dsh-sidechat-title{display:flex;align-items:center;gap:4px;min-width:0;max-width:calc(100% - 36px);border:none;background:0 0;border-radius:6px;padding:4px 6px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);font-weight:500;cursor:pointer}",
			".dsh-sidechat-title:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-sidechat-caret{flex:none;font-size:10px;color:var(--dsw-alias-label-caption)}",
			".dsh-sidechat-menu-wrap{position:relative;flex:none}",
			".dsh-sidechat-more{width:26px;height:26px;display:grid;place-items:center;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:15px;line-height:1;cursor:pointer;padding:0}",
			".dsh-sidechat-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:20;display:flex;flex-direction:column;min-width:168px;padding:4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-menu,#fff);box-shadow:var(--dsw-elevation-panel,0 4px 16px rgba(0,0,0,.18))}",
			".dsh-sidechat-menu-item{text-align:left;border:none;background:0 0;border-radius:6px;padding:6px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}",
			".dsh-sidechat-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-menu-item:disabled{opacity:.45;cursor:default}",
			".dsh-sidechat-action{height:26px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;white-space:nowrap}",
			".dsh-sidechat-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-sidechat-action:disabled{opacity:.45;cursor:default}",
			".dsh-sidechat-status{padding:5px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary);border-bottom:.5px solid var(--dsw-alias-border-l2)}",
			".dsh-sidechat-switcher{display:flex;flex-direction:column;gap:2px;padding:6px;border-bottom:.5px solid var(--dsw-alias-border-l2);max-height:min(240px,40vh);overflow:auto;flex:none;background:var(--dsw-specific-menu,transparent)}",
			".dsh-sidechat-thread{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;border:none;background:0 0;border-radius:6px;padding:6px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".dsh-sidechat-thread:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-sidechat-thread.is-current{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-thread-topic{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-sidechat-thread-mark{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-thread-new{color:var(--dsw-alias-state-business-primary);font-weight:500}",
			".dsh-sidechat-error{margin:12px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-menu,#fff);font-size:13px;color:var(--dsw-alias-label-secondary)}",
			".dsh-sidechat-error p{margin:6px 0}",
			".dsh-sidechat-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}",
			".dsh-sidechat-loading{padding:24px 16px;font-size:13px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-handoff{padding:24px 16px;display:flex;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary)}",
			".dsh-sidechat-handoff-title{margin:0;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-handoff-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
			// The host's content factory owns its own column and composer seat:
			// grow the wrapper but never force the child's height, or the composer
			// is pushed out of the panel.
			".dsh-sidechat-conversation{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}",
			".dsh-sidechat-session{display:flex;flex-direction:column;flex:1 0 auto;min-width:0}",
			".dsh-sidechat-header-wrap{position:relative;display:inline-flex;margin-left:4px}",
			".dsh-sidechat-header{height:26px;padding:0 8px;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer}",
			".dsh-sidechat-header:hover,.dsh-sidechat-header[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dsh-sidechat-picker{position:fixed;z-index:1300;box-sizing:border-box;width:min(280px,calc(100vw - 24px));max-height:min(60vh,420px);overflow-y:auto;padding:6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-specific-menu,#fff);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.16));color:var(--dsw-alias-label-primary);font-size:13px}",
			".dsh-sidechat-picker-head{padding:4px 8px 6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-picker-new{display:flex;width:100%;align-items:center;gap:6px;padding:7px 8px;border:none;border-radius:8px;background:0 0;color:var(--dsw-alias-state-business-primary);font-size:13px;text-align:left;cursor:pointer}",
			".dsh-sidechat-picker-new:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-sidechat-picker-list{display:flex;flex-direction:column;gap:1px;margin-top:2px;border-top:.5px solid var(--dsw-alias-border-l2);padding-top:4px}",
			".dsh-sidechat-picker-item{display:flex;width:100%;align-items:baseline;justify-content:space-between;gap:10px;padding:7px 8px;border:none;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:13px;text-align:left;cursor:pointer}",
			".dsh-sidechat-picker-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-picker-topic{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-sidechat-picker-time{flex:none;font-size:11px;color:var(--dsw-alias-label-caption)}",
			".dsh-sidechat-picker-empty{padding:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-thread-time{flex:none;margin-left:auto;padding-left:8px;font-size:11px;color:var(--dsw-alias-label-caption)}",
			".dsh-sidechat-selection{corner-shape:round;background:var(--dsw-alias-button-floating-fill);--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);cursor:pointer;border:none;border-radius:999px;padding:5px 10px}",
			".dsh-sidechat-selection:hover{background:var(--dsw-alias-button-floating-hover)}"
		].join("\n");

		function installStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin-css="dsh-sidechat/panel.css"]') !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-sidechat";
			tag.dataset.pluginCss = "dsh-sidechat/panel.css";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ── plugin body ────────────────────────────────────────────────────

		const inject = ["slots", "sessions"];

		function apply(ctx) {
			installStyles();

			// Follow the host language setting; the browser language is the
			// fallback when this plugin runs without a locale service.
			ctx.effect(() => {
				try {
					const locale = ctx.get("locale");
					if (locale !== undefined && locale !== null) return attachLocale(locale);
				} catch (_error) {}
				return () => {};
			}, "dsh-sidechat: locale");

			// The tab registration waits for the native right sidebar service: the
			// slot declaration appears before the registry is provided, so waiting
			// on the slot would silently register nothing.
			ctx.effect(() => {
				if (typeof ctx.inject !== "function") return;
				return ctx.inject(["sidebarRightTabs"], (injected) => {
					const tabs = injected.get("sidebarRightTabs");
					if (tabs === undefined || typeof tabs.register !== "function") return;
					const dispose = tabs.register({
						id: IMPL,
						kind: KIND,
						multiple: true,
						keepMounted: true,
						priority: "extension",
						title: () => T.tab,
						guide: [{ order: 80, title: () => T.menu }]
					});
					return () => dispose();
				});
			}, "dsh-sidechat: tab type");

			ctx.effect(() => ctx.slots.inject("dshside.conversation", () => ctx.slots.register({
				name: "dshside.conversation"
			}, Content)), "dsh-sidechat: conversation body");

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: IMPL,
				children: { "dshside.conversation": { kind: "single", scope: "session" } },
				inject: (sessionId) => ({ ctx, sessionId })
			}, Panel)), "dsh-sidechat: panel body");

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: IMPL,
				inject: (sessionId) => ({ ctx, sessionId })
			}, TabTitle)), "dsh-sidechat: tab title");

			ctx.effect(() => registerSessionListFilter(ctx), "dsh-sidechat: session list filter");
			ctx.effect(() => registerChatNodeGate(ctx), "dsh-sidechat: inherited-history gate");

			ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "dsh-sidechat-header",
				order: 11,
				inject: () => ({ ctx })
			}, HeaderButton)), "dsh-sidechat: header entry");

			ctx.effect(() => ctx.slots.inject("conversation.chat.text-interaction", () => ctx.slots.register({
				name: "conversation.chat.text-interaction",
				key: "sidechat",
				priority: -2,
				inject: () => ({ ctx })
			}, SelectionAsk)), "dsh-sidechat: selection entry");

			// Imperative face for sibling plugins (dsh-quote-cards): open a side
			// thread for the current session with an optional draft.
			ctx.effect(() => {
				try {
					return ctx.provide("sideChat", {
						open(parentId, draft) {
							return openSideChat(ctx, parentId, typeof draft === "string" ? draft : "");
						}
					});
				} catch (error) {
					console.warn("[dsh-sidechat] sideChat service unavailable:", error);
					return () => {};
				}
			}, "dsh-sidechat: service");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__test = {
			assistantText,
			baselineOf,
			lastSideReply,
			quoteSelection,
			quoteFallback,
			parseQuoteCardDraft,
			topicOf,
			sideTitleOf,
			seedHashOf,
			sessionInput,
			readThread,
			writeThread,
			visibleSessionList,
			hideSession,
			showSession,
			beginListWindow,
			visibilitySnapshot,
			registerSessionListFilter,
			registerChatNodeGate,
			openSideChat,
			threadLabel,
			relativeTime,
			threadRequestFor: (parentId) => threadRequests.get(parentId) ?? null,
			forkBoundaryOf,
			lastSeqOf,
			isInheritedNode,
			patchChatNodes,
			clearAllSideChatData,
			readThreadList,
			upsertThread,
			recoverThreads,
			threadTopic,
			sessionTitleOf,
			threadTitleOf,
			effectiveHostTitle,
			lastTurnOf,
			syncModel,
			resetVisibility() {
				hiddenIds = new Set();
				pendingLists = [];
			},
			/** Test-only: drop the attached locale so the fallback path is testable. */
			resetLocale() {
				localeService = undefined;
				dictionary = en;
				dictionaryLocale = "";
			}
		};
		return module.exports;
	}
});
