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
			reasoning: "Reasoning",
			contextRow: "Context from the main conversation",
			interrupted: "Stopped",
			turnFailed: "This turn failed",
			toolFailed: "A tool call failed",
			panelCrashed: "The side chat panel crashed.",
			cutUnknown: "Could not determine where this side chat starts, so its history is hidden.",
			emptyThread: "No messages yet in this side chat.",
			thinking: "Working…",
			enterHint: "Enter to send · Shift+Enter for a new line",
			send: "Send",
			stop: "Stop",
			sendFailed: "Could not send",
			composerPlaceholder: "Ask about the current conversation…",
			modelButton: "Model",
			modelTitle: "Model for this side chat",
			modelFailed: "Could not switch the model",
			noModels: "No model catalog available",
			loading: "Loading…",
			permissionButton: "Permission",
			permissionTitle: "Permission level for this side chat",
			permissionFailed: "Could not switch the permission level",
			noPermissions: "No permission presets available",
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
			quoteLabel: "Quoted:",
			removeHandoff: "Remove imported text"
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
			reasoning: "思考过程",
			contextRow: "继承自主对话的上下文",
			interrupted: "已停止",
			turnFailed: "本轮执行失败",
			toolFailed: "工具调用失败",
			panelCrashed: "侧聊面板渲染出错。",
			cutUnknown: "无法确定这条侧聊的起始位置，已隐藏历史内容。",
			emptyThread: "这条侧聊还没有消息。",
			thinking: "正在处理…",
			enterHint: "Enter 发送 · Shift+Enter 换行",
			send: "发送",
			stop: "停止",
			sendFailed: "发送失败",
			composerPlaceholder: "就当前对话提问…",
			modelButton: "模型",
			modelTitle: "这条侧聊使用的模型",
			modelFailed: "切换模型失败",
			noModels: "宿主未提供模型目录",
			loading: "加载中…",
			permissionButton: "权限",
			permissionTitle: "这条侧聊的权限等级",
			permissionFailed: "切换权限失败",
			noPermissions: "宿主未提供权限预设",
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
			quoteLabel: "引用：",
			removeHandoff: "移除这次导入"
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
					inheritedCount: typeof value.inheritedCount === "number" ? value.inheritedCount : null,
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
				inheritedCount: Object.prototype.hasOwnProperty.call(patch, "inheritedCount")
					? patch.inheritedCount
					: (current.inheritedCount ?? null),
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
			sideDrafts.clear();
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

		// Live handoffs are queued, not overwritten, until the selected child
		// can adopt them. New panels also carry an id in their navigation.
		const pendingDrafts = new Map();
		const EMPTY_HANDOFFS = Object.freeze([]);
		let handoffSequence = 0;
		function pendingFor(parentId) {
			return pendingDrafts.get(parentId) ?? EMPTY_HANDOFFS;
		}
		function newHandoffId() {
			return globalThis.crypto?.randomUUID?.()
				?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + (++handoffSequence);
		}
		function handoffSegments(draft, quote) {
			const segments = parseQuoteCardDraft(draft);
			if (typeof quote === "string" && quote.trim() !== "") {
				segments.push({ type: "quote", text: quote.replace(/\r\n?/g, "\n").trim() });
			}
			return segments;
		}

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
			const segments = handoffSegments(draft, quote);
			const handoffId = segments.length > 0 ? newHandoffId() : "";
			const openTab = readOpenTab(parentId);
			if (openTab !== "" && focusTab(ctx, openTab)) {
				if (options !== undefined) requestThread(parentId, childId);
				if (handoffId !== "") {
					const target = options !== undefined ? childId : (readThread(parentId, openTab)?.childId ?? "");
					if (target !== "") acceptHandoff(target, handoffId, segments);
					else {
						pendingDrafts.set(parentId, [...pendingFor(parentId), {
							id: handoffId, tabId: openTab, segments
						}]);
						notifyThreads();
					}
				}
				return true;
			}

			forgetOpenTab(parentId);
			try {
				sidebar.openTab(KIND, {
					params: {
						parentSessionId: parentId,
						...(childId !== "" ? { childId } : {}),
						...(handoffId !== "" ? { handoffId } : {}),
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


		/**
		 * The fork cut, read from the child while it is still untouched: right
		 * after a fork the child's log contains exactly the inherited prefix, so
		 * its newest seq *is* the boundary. Doing this before any user input is
		 * what makes the cut trustworthy — reading it later would include the
		 * side chat's own first message.
		 * @param ctx plugin context
		 * @param childId forked session id
		 * @param attempts bounded waits for the binding to appear
		 * @returns newest inherited seq, or 0 when unreadable
		 */
		async function forkCutOf(ctx, childId, attempts = 40) {
			const prefix = await forkPrefixOf(ctx, childId, attempts);
			return prefix.cut;
		}

		/**
		 * Describe the inherited prefix of a freshly forked child.
		 *
		 * Seq alone is not enough: a fork may renumber its own events, in which
		 * case "seq > cut" hides the side chat's own messages. The row COUNT of the
		 * untouched child is numbering-independent — the first N rows are inherited,
		 * everything after belongs to this thread.
		 * @param ctx plugin context
		 * @param childId forked session id
		 * @param attempts bounded waits for the binding to appear
		 * @returns {count: number, cut: number}
		 */
		/**
		 * Count rows that belong to the inherited prefix described by `marker`.
		 * The marker is the seq of the fork's own seed, so every row at or below it
		 * is inherited — a numbering-independent count for threads created before
		 * the count was recorded.
		 * @param snapshot child conversation snapshot
		 * @param marker inherited-boundary seq, or null
		 * @returns inherited row count, or null when it cannot be derived
		 */
		function inheritedCountOf(snapshot, marker) {
			if (typeof marker !== "number" || marker < 0) return null;
			const nodes = snapshot?.nodes ?? [];
			if (nodes.length === 0) return null;
			let count = 0;
			for (const node of nodes) {
				if (typeof node?.seq === "number" && node.seq <= marker) count += 1;
			}
			return count;
		}

		async function forkPrefixOf(ctx, childId, attempts = 40) {
			for (let index = 0; index < attempts; index += 1) {
				let snapshot;
				try {
					snapshot = ctx.sessions.binding(childId)?.session?.getSnapshot?.();
				} catch (_error) {
					snapshot = undefined;
				}
				const nodes = snapshot?.nodes ?? [];
				const cut = lastSeqOf(snapshot);
				if (nodes.length > 0) return { count: nodes.length, cut };
				// Some hosts expose turn data before the row array; a known cut is
				// still useful even when the row count is not.
				if (cut > 0 && snapshot?.hasMore === false) return { count: 0, cut };
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			return { count: 0, cut: 0 };
		}

		/**
		 * Newest durable seq in a conversation snapshot. Several shapes are
		 * possible across host versions, so every one of them is inspected:
		 * the legacy `nodes` array, the Chat definition's node map, and — the most
		 * reliable for a fork cut — `turnEnds` (turn → turn/end seq).
		 * @param {unknown} snapshot conversation snapshot, possibly partial
		 * @returns {number} newest seq, or 0 when nothing is readable
		 */
		function lastSeqOf(snapshot) {
			let max = 0;
			const bump = (value) => {
				if (typeof value === "number" && Number.isFinite(value) && value > max) max = value;
			};
			for (const node of snapshot?.nodes ?? []) bump(node?.seq);
			const chatNodes = snapshot?.chat?.nodes;
			if (chatNodes !== null && chatNodes !== undefined) {
				const values = typeof chatNodes.values === "function" ? [...chatNodes.values()] : (Array.isArray(chatNodes) ? chatNodes : []);
				for (const entry of values) {
					bump(entry?.seq);
					bump(entry?.data?.finalNode?.seq);
					bump(entry?.data?.node?.seq);
				}
			}
			const turnEnds = snapshot?.turnEnds;
			if (turnEnds !== null && turnEnds !== undefined && typeof turnEnds.values === "function") {
				for (const seq of turnEnds.values()) bump(seq);
			}
			const timings = snapshot?.turnTimings;
			if (timings !== null && timings !== undefined && typeof timings.forEach === "function") {
				timings.forEach((value) => bump(value?.endSeq ?? value?.endTime));
			}
			return max;
		}

		const QUOTE_HEADER = /^> \*\*(?:引用|Quoted) · .*\*\*$/;

		/**
		 * dsh-quote-cards hands its cards over as one Markdown draft
		 * ("> **引用 · 选中文字**" + quoted lines). The composer shows that text
		 * verbatim, so split it into ordered quote/text segments for the side
		 * composer to preview and serialize.
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

		// ── own transcript renderer ────────────────────────────────────────

		// The panel renders the side thread itself instead of borrowing the host
		// Chat view. Correctness no longer depends on slot timing, patchable
		// entries or row attributes: the child's snapshot is filtered by the fork
		// cut here and only the surviving rows are drawn.

		/** Flatten a node's content blocks into plain text. */
		function contentText(blocks) {
			return (blocks ?? [])
				.filter((block) => block !== null && block !== undefined && typeof block.text === "string")
				.map((block) => block.text)
				.join("");
		}

		/** Split text into fenced code and plain segments for rendering. */
		function textSegments(text) {
			const segments = [];
			const pattern = /\u0060\u0060\u0060([a-zA-Z0-9_+-]*)\n([\s\S]*?)\u0060\u0060\u0060/g;
			let last = 0;
			let match;
			while ((match = pattern.exec(text)) !== null) {
				if (match.index > last) segments.push({ kind: "text", text: text.slice(last, match.index) });
				segments.push({ kind: "code", lang: match[1], text: match[2] });
				last = match.index + match[0].length;
			}
			if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
			return segments;
		}

		function RichText(props) {
			const segments = textSegments(props.text ?? "");
			return react.createElement(
				"div",
				{ className: "dsh-sidechat-rich" },
				segments.map((segment, index) => segment.kind === "code"
					? react.createElement(
						"pre",
						{ key: "s" + index, className: "dsh-sidechat-code" },
						react.createElement("code", null, segment.text)
					)
					: react.createElement("p", { key: "s" + index, className: "dsh-sidechat-text" }, segment.text)
				)
			);
		}

		/** One transcript row. Unknown kinds render nothing rather than raw JSON. */
		function TranscriptRow(props) {
			const node = props.node;
			if (node === null || node === undefined) return null;
			const kind = node.kind;
			if (kind === "user" || kind === "steering") {
				const text = contentText(node.content);
				if (text.trim() === "") return null;
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-row-user" },
					react.createElement("div", { className: "dsh-sidechat-bubble" }, text));
			}
			if (kind === "assistant") {
				const blocks = node.blocks ?? [];
				const reasoning = blocks.filter((block) => block.kind === "reasoning" && typeof block.text === "string" && block.text.trim() !== "");
				const tools = blocks.filter((block) => block.kind === "tool-call");
				const text = blocks.filter((block) => block.kind === "text").map((block) => block.text).join("");
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-row-assistant" },
					reasoning.length > 0 ? react.createElement("details", { className: "dsh-sidechat-reasoning" },
						react.createElement("summary", null, T.reasoning),
						reasoning.map((block, index) => react.createElement("p", { key: "r" + index, className: "dsh-sidechat-text" }, block.text))
					) : null,
					tools.map((block, index) => react.createElement("div", { key: "t" + index, className: "dsh-sidechat-tool" },
						react.createElement("span", { className: "dsh-sidechat-tool-name" }, block.name ?? "tool"),
						react.createElement("span", { className: "dsh-sidechat-tool-args" }, String(block.argsRaw ?? "").slice(0, 120))
					)),
					text.trim() === "" ? null : react.createElement(RichText, { text }),
					node.interrupted === true ? react.createElement("div", { className: "dsh-sidechat-note" }, T.interrupted) : null
				);
			}
			if (kind === "turn-error") {
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-error-row" }, node.message ?? T.turnFailed);
			}
			if (kind === "context") {
				const text = contentText(node.content).replace(/\s+/g, " ").trim();
				if (text === "") return null;
				return react.createElement("details", { className: "dsh-sidechat-context" },
					react.createElement("summary", null, T.contextRow),
					react.createElement("p", { className: "dsh-sidechat-text" }, text.slice(0, 2000))
				);
			}
			if (kind === "tool-result" && node.isError === true) {
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-note" }, T.toolFailed);
			}
			return null;
		}

		/**
		 * Rows that belong to this side thread.
		 *
		 * The inherited prefix is a contiguous block at the head of the child log.
		 * When its row count is known that is the only rule used, because it does
		 * not depend on how the fork numbers its events. Without a count the seq
		 * cut is used; with neither, nothing is filtered.
		 * @param snapshot child conversation snapshot
		 * @param cut fork cut in seq space (or null)
		 * @param inheritedCount inherited row count (or null)
		 * @returns rows belonging to this thread
		 */
		function sideRows(snapshot, cut, inheritedCount) {
			const nodes = snapshot?.nodes ?? [];
			// The inherited row count is the only boundary that survives a fork's own
			// renumbering, so it wins when present. Without it (older threads), a seq
			// cut may hide the thread's whole history, so the stored rows are shown.
			if (typeof inheritedCount === "number" && inheritedCount > 0) return nodes.slice(inheritedCount);
			void cut;
			return nodes;
		}

		// ── model & permission controls ────────────────────────────────────

		/** Remote session face that owns modelCatalog/selectModel, probed by shape. */
		function modelFace(ctx) {
			const candidates = [];
			for (const name of ["remote.session", "remote", "session"]) {
				try { candidates.push(ctx.get(name)); } catch (_error) {}
			}
			for (const candidate of candidates) {
				if (candidate === null || candidate === undefined) continue;
				if (typeof candidate.modelCatalog === "function" && typeof candidate.selectModel === "function") return candidate;
				if (candidate.session !== null && candidate.session !== undefined
					&& typeof candidate.session.modelCatalog === "function"
					&& typeof candidate.session.selectModel === "function") return candidate.session;
				// Flat typert keys use the "namespace/method" spelling.
				if (typeof candidate["session/modelCatalog"] === "function" && typeof candidate["session/selectModel"] === "function") {
					return {
						modelCatalog: () => candidate["session/modelCatalog"](),
						selectModel: (request) => candidate["session/selectModel"](request)
					};
				}
			}
			return undefined;
		}

		/** Remote permission-preset catalog face, probed by shape. */
		function permissionFace(ctx) {
			const candidates = [];
			for (const name of ["remote.permissionPresets", "permissionPresets", "remote"]) {
				try { candidates.push(ctx.get(name)); } catch (_error) {}
			}
			for (const candidate of candidates) {
				if (candidate === null || candidate === undefined) continue;
				if (typeof candidate.catalog === "function") return candidate;
				if (candidate.permissionPresets !== null && candidate.permissionPresets !== undefined
					&& typeof candidate.permissionPresets.catalog === "function") return candidate.permissionPresets;
				if (typeof candidate["permissionPresets/catalog"] === "function") {
					return { catalog: () => candidate["permissionPresets/catalog"]() };
				}
			}
			return undefined;
		}

		/** Current permission preset of a session, from its `permissions` projection. */
		function permissionValueOf(ctx, sessionId) {
			try {
				const session = ctx.sessions.binding(sessionId)?.session;
				const value = session?.projections?.faceOf?.("permissions")?.getSnapshot?.();
				const current = value?.currentValue;
				return typeof current === "string" ? current : "";
			} catch (_error) {
				return "";
			}
		}

		/** Read the host model catalog once; empty array on any failure. */
		async function loadModelCatalog(ctx) {
			const face = modelFace(ctx);
			if (face === undefined) return [];
			try {
				const result = await face.modelCatalog();
				if (result?.ok !== true) return [];
				const groups = result.value?.groups ?? [];
				return groups.map((group) => ({
					id: String(group.id ?? ""),
					name: String(group.name ?? group.id ?? ""),
					models: (group.models ?? []).map((model) => ({
						id: String(model.id ?? ""),
						name: String(model.name ?? model.id ?? "")
					}))
				}));
			} catch (_error) {
				return [];
			}
		}

		/** Switch this side session's model. */
		async function selectSideModel(ctx, childId, provider, model) {
			const face = modelFace(ctx);
			if (face === undefined) return false;
			try {
				const result = await face.selectModel({ sessionId: childId, provider, model });
				return result?.ok === true;
			} catch (_error) {
				return false;
			}
		}

		/** Read the host permission catalog; empty array on any failure. */
		async function loadPermissionCatalog(ctx) {
			const face = permissionFace(ctx);
			if (face === undefined) return [];
			try {
				const result = await face.catalog();
				if (result?.ok !== true) return [];
				return (result.value?.options ?? []).map((option) => ({
					value: String(option.value ?? ""),
					name: String(option.name ?? option.value ?? ""),
					description: typeof option.description === "string" ? option.description : ""
				}));
			} catch (_error) {
				return [];
			}
		}

		/** Switch this session's permission preset through the host command. */
		async function selectPermission(ctx, sessionId, preset) {
			try {
				const session = ctx.sessions.binding(sessionId)?.session;
				if (session === undefined || session === null) return false;
				const result = await session.command("/permission " + preset);
				if (result?.ok !== true) return false;
				return result.value?.matched !== false;
			} catch (_error) {
				return false;
			}
		}

		// ── raw event transcript ───────────────────────────────────────────

		// The chat projection is not guaranteed to expose rows (`snapshot.nodes`
		// can be empty while a conversation runs), but the durable session log
		// always does: every message is an event there. Reading that log makes both
		// the rows and the inherited boundary independent of any projection shape.

		/** Event objects of a session's durable log, in order. */
		function sessionEvents(session) {
			try {
				const window = session?.eventSource?.getSnapshot?.();
				const entries = window?.entries ?? [];
				return entries
					.map((entry) => entry?.event ?? entry)
					.filter((event) => event !== null && event !== undefined);
			} catch (_error) {
				return [];
			}
		}

		// useSyncExternalStore requires an identity-stable snapshot: returning a
		// fresh array on every read makes React re-render forever (error #185).
		// The per-source cache keys on the event window's own identity, which only
		// changes when the log actually changes.
		const EMPTY_EVENTS = Object.freeze([]);
		const eventCaches = new WeakMap();

		/**
		 * Identity-stable event list for one session.
		 * @param session session face
		 * @returns the same array until the underlying event window changes
		 */
		function stableSessionEvents(session) {
			if (session === null || session === undefined) return EMPTY_EVENTS;
			let window;
			try {
				window = session.eventSource?.getSnapshot?.();
			} catch (_error) {
				return EMPTY_EVENTS;
			}
			if (window === null || window === undefined) return EMPTY_EVENTS;
			const cached = eventCaches.get(window);
			if (cached !== undefined) return cached;
			const entries = window.entries ?? [];
			const events = entries
				.map((entry) => entry?.event ?? entry)
				.filter((event) => event !== null && event !== undefined);
			eventCaches.set(window, events);
			return events;
		}

		/**
		 * Index of the last inherited-prefix marker in the log.
		 * A fork writes `session/end-seed` with `inherited: true` at the end of the
		 * copied prefix, so every event after it belongs to this side thread.
		 * @param events ordered session events
		 * @returns index of the marker, or -1 when the log has none
		 */
		function inheritedMarkerIndex(events) {
			let index = -1;
			for (let position = 0; position < events.length; position += 1) {
				const event = events[position];
				if (event?.type === "session/end-seed" && event?.data?.inherited === true) index = position;
			}
			return index;
		}

		/** Text of a content array (core ContentBlock[]). */
		function blocksText(content) {
			if (!Array.isArray(content)) return "";
			return content
				.filter((block) => block !== null && block !== undefined && typeof block.text === "string")
				.map((block) => block.text)
				.join("");
		}

		/**
		 * One row per durable event worth showing.
		 * @param events ordered session events
		 * @param from index of the first event to include
		 * @returns transcript rows
		 */
		function rowsFromEvents(events, from) {
			const rows = [];
			for (let position = Math.max(0, from); position < events.length; position += 1) {
				const event = events[position];
				const data = event?.data ?? {};
				if (event?.type === "user/message") {
					const text = blocksText(data.content);
					if (text.trim() !== "") rows.push({ key: "e" + position, kind: "user", text });
					continue;
				}
				if (event?.type === "assistant/message") {
					const content = data.message?.content ?? data.content;
					const text = blocksText(content);
					const tools = Array.isArray(content)
						? content.filter((block) => block?.type === "tool-call").map((block) => ({
							name: String(block.name ?? block.toolName ?? "tool"),
							args: String(block.arguments ?? block.args ?? "").slice(0, 160)
						}))
						: [];
					if (text.trim() !== "" || tools.length > 0) {
						rows.push({ key: "e" + position, kind: "assistant", text, tools });
					}
					continue;
				}
				if (event?.type === "tool/result" && data.isError === true) {
					rows.push({ key: "e" + position, kind: "failure", text: t("toolFailed") });
					continue;
				}
				if (event?.type === "turn/end") {
					const reason = data.reason?.kind ?? data.reason;
					if (reason === "error" || reason === "failed" || reason === "blocked") {
						rows.push({ key: "e" + position, kind: "failure", text: t("turnFailed") });
					}
				}
			}
			return rows;
		}

		/**
		 * Transcript rows plus the boundary they were cut at.
		 * @param events ordered session events
		 * @param fallbackFrom index used when no inherited marker exists
		 * @returns {rows: unknown[], from: number, source: string}
		 */
		function eventTranscript(events, fallbackFrom) {
			const marker = inheritedMarkerIndex(events);
			if (marker >= 0) return { rows: rowsFromEvents(events, marker + 1), from: marker + 1, source: "events-marker" };
			const from = typeof fallbackFrom === "number" && fallbackFrom > 0 ? fallbackFrom : 0;
			return { rows: rowsFromEvents(events, from), from, source: from > 0 ? "events-index" : "events-all" };
		}

		function Transcript(props) {
			const snapshot = props.snapshot;
			const events = props.events ?? [];
			// The durable log is the primary source; projections are the fallback.
			const fromEvents = events.length > 0 ? eventTranscript(events, props.inheritedCount ?? 0) : null;
			const rows = fromEvents !== null ? fromEvents.rows : sideRows(snapshot, props.cut, props.inheritedCount);
			const partial = snapshot?.partial ?? null;
			const partialText = contentText(partial?.blocks ?? partial?.content);
			const scrollRef = react.useRef(null);
			react.useEffect(() => {
				const node = scrollRef.current;
				if (node !== null) node.scrollTop = node.scrollHeight;
			}, [rows.length, partialText.length]);
			return react.createElement(
				"div",
				{ className: "dsh-sidechat-transcript", ref: scrollRef },
				rows.length === 0 && partialText === "" && snapshot?.running !== true
					? react.createElement("div", { className: "dsh-sidechat-empty" }, T.emptyThread)
					: null,
				rows.map((row) => (row.key !== undefined
					? react.createElement(EventRow, { key: row.key, row })
					: react.createElement(TranscriptRow, { key: String(row.seq), node: row }))),
				partialText.trim() === "" ? null : react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-row-assistant" },
					react.createElement(RichText, { text: partialText })
				),
				snapshot?.running === true ? react.createElement("div", { className: "dsh-sidechat-running" }, T.thinking) : null
			);
		}

		/** One row built from the durable event log. */
		function EventRow(props) {
			const row = props.row;
			if (row.kind === "user") {
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-row-user" },
					react.createElement("div", { className: "dsh-sidechat-bubble" }, row.text));
			}
			if (row.kind === "failure") {
				return react.createElement("div", { className: "dsh-sidechat-row dsh-sidechat-error-row" }, row.text);
			}
			return react.createElement(
				"div",
				{ className: "dsh-sidechat-row dsh-sidechat-row-assistant" },
				(row.tools ?? []).map((tool, index) => react.createElement("div", { key: "t" + index, className: "dsh-sidechat-tool" },
					react.createElement("span", { className: "dsh-sidechat-tool-name" }, tool.name),
					react.createElement("span", { className: "dsh-sidechat-tool-args" }, tool.args)
				)),
				row.text.trim() === "" ? null : react.createElement(RichText, { text: row.text })
			);
		}

		/**
		 * Compact diagnostics strip. It answers the two questions that actually
		 * decide whether the transcript is right: how many inherited rows were
		 * skipped, and where that boundary came from.
		 */
		/**
		 * Render-free diagnostics payload: the summary line plus the full detail.
		 * Kept pure so the numbers can be asserted in tests.
		 * @param input snapshot/cut/count state
		 * @returns {summary: string, detail: string}
		 */
		function diagnosticsOf(input) {
			const snapshot = input.snapshot;
			const events = input.events ?? [];
			const byEvents = events.length > 0 ? eventTranscript(events, input.inheritedCount ?? 0) : null;
			const rows = byEvents !== null ? byEvents.rows : sideRows(snapshot, input.cut, input.inheritedCount);
			const total = byEvents !== null ? events.length : (snapshot?.nodes ?? []).length;
			const count = byEvents !== null ? byEvents.from : (typeof input.inheritedCount === "number" ? input.inheritedCount : "?");
			const source = byEvents !== null ? byEvents.source : (input.boundarySource ? input.boundarySource : "-");
			return {
				summary: "诊断 · 继承 " + count + " · 显示 " + rows.length + "/" + total,
				detail: [
					"child=" + (input.childId ? String(input.childId).slice(0, 8) : "-"),
					"boundary=" + (typeof input.cut === "number" ? input.cut : "null"),
					"source=" + source,
					"events=" + events.length,
					"inheritedCount=" + (typeof input.inheritedCount === "number" ? input.inheritedCount : "null"),
					"rows=" + rows.length + "/" + total,
					"running=" + (snapshot?.running === true),
					"hasMore=" + (snapshot?.hasMore === true),
					"phase=" + (snapshot?.composerPhase ?? "-")
				].join(" · ")
			};
		}

		function Diagnostics(props) {
			const [open, setOpen] = react.useState(false);
			const info = diagnosticsOf(props);
			const summary = info.summary;
			const detail = info.detail;
			return react.createElement(
				"div",
				{ className: "dsh-sidechat-diagnostics" },
				react.createElement(
					"button",
					{
						type: "button",
						className: "dsh-sidechat-diagnostics-toggle",
						onClick: () => { setOpen((value) => !value); },
						title: detail
					},
					summary
				),
				open ? react.createElement(
					"div",
					{ className: "dsh-sidechat-diagnostics-body", "data-dsh-sidechat-diagnostics": true },
					detail
				) : null
			);
		}

		// ── own composer ───────────────────────────────────────────────────

		// The editable text, ordered imports and their receipts have one owner.
		// A batch is one write; an acknowledgment removes only what it sent.
		const sideDrafts = new Map();
		const sendingChildren = new Set();
		const EMPTY_SIDE_DRAFT = { text: "", textRev: 0, entries: EMPTY_HANDOFFS, receipts: EMPTY_HANDOFFS };
		function sideDraftKey(childId) {
			return STORE_PREFIX + "composer." + childId;
		}
		function readSideDraft(childId) {
			if (sideDrafts.has(childId)) return sideDrafts.get(childId);
			let draft = EMPTY_SIDE_DRAFT;
			try {
				const raw = localStorage.getItem(sideDraftKey(childId));
				if (raw !== null) {
					const saved = JSON.parse(raw);
					if (typeof saved?.text === "string" && Number.isSafeInteger(saved.textRev) &&
						Array.isArray(saved.entries) && Array.isArray(saved.receipts)) draft = saved;
				} else {
					const legacy = localStorage.getItem(STORE_PREFIX + "draft." + childId);
					if (typeof legacy === "string" && legacy !== "") draft = { ...draft, text: legacy };
				}
			} catch (_error) {}
			sideDrafts.set(childId, draft);
			return draft;
		}
		function writeSideDraft(childId, next) {
			sideDrafts.set(childId, next);
			try {
				localStorage.setItem(sideDraftKey(childId), JSON.stringify(next));
				localStorage.removeItem(STORE_PREFIX + "draft." + childId);
			} catch (_error) {
				// Keep the full draft usable in this page when storage is blocked.
			}
			notifyThreads();
		}
		function acceptHandoff(childId, id, segments) {
			const current = readSideDraft(childId);
			if (current.receipts.includes(id)) return;
			writeSideDraft(childId, {
				...current,
				entries: [...current.entries, { id, segments }],
				receipts: [...current.receipts, id]
			});
		}
		function changeSideText(childId, text) {
			const current = readSideDraft(childId);
			if (text !== current.text) writeSideDraft(childId, { ...current, text, textRev: current.textRev + 1 });
		}
		function removeHandoff(childId, id) {
			const current = readSideDraft(childId);
			const entries = current.entries.filter((entry) => entry.id !== id);
			if (entries.length !== current.entries.length) writeSideDraft(childId, { ...current, entries });
		}
		function acknowledgeSidePrompt(childId, submitted) {
			const current = readSideDraft(childId);
			const submittedIds = new Set(submitted.entries.map((entry) => entry.id));
			const entries = current.entries.filter((entry) => !submittedIds.has(entry.id));
			const clearText = current.textRev === submitted.textRev && current.text !== "";
			if (clearText || entries.length !== current.entries.length) {
				writeSideDraft(childId, {
					...current, entries,
					...(clearText ? { text: "", textRev: current.textRev + 1 } : {})
				});
			}
		}
		function composeSidePrompt(text, entries) {
			const imported = entries.flatMap((entry) => entry.segments)
				.map((part) => part.type === "quote" ? quoteSelection(part.text) : part.text);
			return [...imported, text.trim()].filter(Boolean).join("\n\n");
		}

		function SideComposer(props) {
			const session = props.session;
			const childId = props.childId;
			const running = props.running === true;
			const { text: draft, entries } = react.useSyncExternalStore(
				subscribeThreads, () => readSideDraft(childId), () => EMPTY_SIDE_DRAFT
			);
			const sending = react.useSyncExternalStore(
				subscribeThreads, () => sendingChildren.has(childId), () => false
			);
			const [error, setError] = react.useState("");
			// Model and permission pickers: catalogs load on first open.
			const [menu, setMenu] = react.useState("");
			const [models, setModels] = react.useState([]);
			const [permissions, setPermissions] = react.useState([]);
			const [modelsLoading, setModelsLoading] = react.useState(false);
			const [baseModel, setBaseModel] = react.useState(props.model ?? "");
			const [permissionValue, setPermissionValue] = react.useState("");
			const rootRef = react.useRef(null);
			const areaRef = react.useRef(null);
			const mounted = react.useRef(false);
			react.useEffect(() => {
				mounted.current = true;
				return () => { mounted.current = false; };
			}, []);
			react.useEffect(() => {
				const node = areaRef.current;
				if (node === null) return;
				node.style.height = "auto";
				node.style.height = Math.min(node.scrollHeight, 180) + "px";
			}, [draft]);

			const send = async () => {
				const submitted = readSideDraft(childId);
				const text = composeSidePrompt(submitted.text, submitted.entries);
				if (text === "" || session === null || session === undefined || sendingChildren.has(childId)) return;
				// Guard the child, not the component: closing/reopening a
				// composer does not give it a second submit slot.
				sendingChildren.add(childId);
				notifyThreads();
				setError("");
				try {
					const result = await session.prompt([{ type: "text", text }], "queue");
					if (result?.ok === true) {
						// An acknowledgment is for the submitted draft, not edits made
						// while the request was pending or after the composer unmounted.
						acknowledgeSidePrompt(childId, submitted);
					} else if (mounted.current) {
						setError(result?.error?.message ?? T.sendFailed);
					}
				} catch (failure) {
					if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
				} finally {
					sendingChildren.delete(childId);
					notifyThreads();
					if (mounted.current) {
						requestAnimationFrame(() => {
							if (mounted.current) areaRef.current?.focus();
						});
					}
				}
			};

			const stop = async () => {
				try {
					await session?.cancel?.();
				} catch (_error) {}
			};

			// Parent's model is the starting point; a manual pick replaces it.
			react.useEffect(() => {
				if (props.model) setBaseModel(props.model);
			}, [props.model]);
			// Permission is a durable projection of this session: read it and follow
			// the projection face when it is subscribable. No polling — hosts and
			// test harnesses do not all provide timers.
			react.useEffect(() => {
				if (childId === "" || props.ctx === undefined) return undefined;
				const read = () => setPermissionValue(permissionValueOf(props.ctx, childId));
				read();
				let face;
				try {
					const session = props.ctx.sessions.binding(childId)?.session;
					face = session?.projections?.faceOf?.("permissions");
				} catch (_error) {
					face = undefined;
				}
				if (face === undefined || typeof face.subscribe !== "function") return undefined;
				const off = face.subscribe(read);
				return () => { if (typeof off === "function") off(); };
			}, [props.ctx, childId, menu]);
			react.useEffect(() => {
				if (menu === "") return undefined;
				const onPointerDown = (event) => {
					const root = rootRef.current;
					if (root !== null && event.target instanceof Node && !root.contains(event.target)) setMenu("");
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [menu]);

			const openModelMenu = async () => {
				if (menu === "model") { setMenu(""); return; }
				setMenu("model");
				if (models.length > 0 || modelsLoading) return;
				setModelsLoading(true);
				setModels(await loadModelCatalog(props.ctx));
				setModelsLoading(false);
			};
			const openPermissionMenu = async () => {
				if (menu === "permission") { setMenu(""); return; }
				setMenu("permission");
				if (permissions.length > 0) return;
				setPermissions(await loadPermissionCatalog(props.ctx));
			};
			const pickModel = async (provider, modelId, name) => {
				setMenu("");
				if (await selectSideModel(props.ctx, childId, provider, modelId)) setBaseModel(name);
				else setError(T.modelFailed);
			};
			const pickPermission = async (value) => {
				setMenu("");
				if (await selectPermission(props.ctx, childId, value)) setPermissionValue(value);
				else setError(T.permissionFailed);
			};

			return react.createElement(
				"div",
				{ className: "dsh-sidechat-composer", ref: rootRef },
				error !== "" ? react.createElement("div", { className: "dsh-sidechat-note" }, error) : null,
				menu === "model" ? react.createElement(
					"div",
					{ className: "dsh-sidechat-menu-panel", role: "menu" },
					modelsLoading ? react.createElement("div", { className: "dsh-sidechat-note" }, T.loading) : null,
					models.length === 0 && !modelsLoading
						? react.createElement("div", { className: "dsh-sidechat-note" }, T.noModels)
						: null,
					models.map((group) => react.createElement(
						"div",
						{ key: group.id, className: "dsh-sidechat-menu-group" },
						react.createElement("div", { className: "dsh-sidechat-menu-group-name" }, group.name),
						group.models.map((model) => react.createElement(
							"button",
							{
								key: group.id + "/" + model.id,
								type: "button",
								role: "menuitem",
								className: "dsh-sidechat-menu-row",
								onClick: () => void pickModel(group.id, model.id, model.name)
							},
							model.name
						))
					))
				) : null,
				menu === "permission" ? react.createElement(
					"div",
					{ className: "dsh-sidechat-menu-panel", role: "menu" },
					permissions.length === 0
						? react.createElement("div", { className: "dsh-sidechat-note" }, T.noPermissions)
						: null,
					permissions.map((option) => react.createElement(
						"button",
						{
							key: option.value,
							type: "button",
							role: "menuitem",
							className: "dsh-sidechat-menu-row" + (option.value === permissionValue ? " is-current" : ""),
							title: option.description,
							onClick: () => void pickPermission(option.value)
						},
						option.name
					))
				) : null,
				react.createElement(
					"div",
					{ className: "dsh-sidechat-card" },
					entries.map((entry) => react.createElement(
						"div", { key: entry.id, className: "dsh-sidechat-import" },
						entry.segments.map((segment, index) => react.createElement(
							segment.type === "quote" ? "blockquote" : "div", { key: index },
							segment.type === "quote" ? react.createElement("strong", null, T.quoteLabel) : null,
							segment.text
						)),
						react.createElement("button", {
							type: "button", title: T.removeHandoff, "aria-label": T.removeHandoff,
							onClick: () => removeHandoff(childId, entry.id)
						}, "×")
					)),
					react.createElement("textarea", {
						ref: areaRef,
						className: "dsh-sidechat-input",
						value: draft,
						rows: 1,
						placeholder: T.composerPlaceholder,
						onChange: (event) => changeSideText(childId, event.target.value),
						onKeyDown: (event) => {
							if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing === true) return;
							event.preventDefault();
							void send();
						}
					}),
					react.createElement(
						"div",
						{ className: "dsh-sidechat-composer-bar" },
						react.createElement(
							"span",
							{ className: "dsh-sidechat-composer-left" },
							react.createElement("button", {
								type: "button",
								className: "dsh-sidechat-pill",
								title: T.permissionTitle,
								"aria-haspopup": "menu",
								"aria-expanded": menu === "permission",
								onClick: () => void openPermissionMenu()
							}, permissionValue === "" ? T.permissionButton : permissionValue),
							react.createElement("button", {
								type: "button",
								className: "dsh-sidechat-pill",
								title: T.modelTitle,
								"aria-haspopup": "menu",
								"aria-expanded": menu === "model",
								onClick: () => void openModelMenu()
							}, baseModel === "" ? T.modelButton : baseModel)
						),
						react.createElement(
							"span",
							{ className: "dsh-sidechat-composer-right" },
							react.createElement("span", { className: "dsh-sidechat-note" }, running ? T.thinking : ""),
							running
								? react.createElement("button", {
									type: "button",
									className: "dsh-sidechat-send is-stop",
									title: T.stop,
									"aria-label": T.stop,
									onClick: () => void stop()
								}, "■")
								: react.createElement("button", {
									type: "button",
									className: "dsh-sidechat-send",
									title: T.send,
									"aria-label": T.send,
									disabled: (draft.trim() === "" && entries.length === 0) || sending,
									onClick: () => void send()
								}, "↑")
						)
					)
				)
			);
		}

		/** Never leave the pane blank: render the failure instead of unmounting. */
		class PanelBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error) {
				console.warn("[dsh-sidechat] panel crashed:", error);
			}
			render() {
				if (this.state.error !== null) {
					return react.createElement(
						"div",
						{ className: "dsh-sidechat-error", role: "alert" },
						react.createElement("strong", null, t("panelCrashed")),
						react.createElement("p", null, this.state.error)
					);
				}
				return this.props.children;
			}
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
			const pending = react.useSyncExternalStore(
				subscribeThreads, () => pendingFor(parentId), () => EMPTY_HANDOFFS
			);
			const navigationConsumed = react.useRef(false);

			const initial = readThread(parentId, tab.id)
				?? (typeof params.childId === "string" && params.childId !== "" ? { childId: params.childId } : null);
			const [childId, setChildId] = react.useState(initial?.childId ?? "");
			const [reference, setReference] = react.useState(null);
			const [forkError, setForkError] = react.useState("");
			const [status, setStatus] = react.useState("");
			const [boundary, setBoundary] = react.useState(null);
			const [inheritedCount, setInheritedCount] = react.useState(null);
			const [boundarySource, setBoundarySource] = react.useState("");
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
				}).then(async (id) => {
					// The cut must be read from the untouched child: right after the
					// fork its log is exactly the inherited prefix. Prefer the parent's
					// own last seq, then the fresh child's, and only then give up.
					let cut = parentCut;
					let inheritedCount = 0;
					if (!(cut > 0)) {
						const prefix = await forkPrefixOf(ctx, id);
						cut = prefix.cut;
						inheritedCount = prefix.count;
					}
					// Persist even when this panel already unmounted: the tab must
					// reattach to the same child instead of forking an orphan.
					writeThread(parentId, tab.id, {
						childId: id,
						boundary: cut > 0 ? cut : null,
						turn: parentTurn,
						inheritedCount,
						fresh: false
					});
					hideSession(id);
					release();
					if (cancelled) return;
					if (inheritedCount > 0) setInheritedCount(inheritedCount);
					setBoundarySource(inheritedCount > 0 ? "fork-count" : (cut > 0 ? "fork-seq" : "none"));
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
						const settle = (value, source) => {
							if (cancelled || baseline.current !== null) return;
							baseline.current = value;
							setBoundary(value);
							setBoundarySource(source ?? "cut");
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
						if (typeof record?.inheritedCount === "number") setInheritedCount(record.inheritedCount);
						if (record?.fresh === true) {
							// Nothing was inherited, so everything the session owns is new.
							setBoundaryTurn(null);
							setBoundarySource("fresh");
							settle(0, "fresh");
							return;
						}
						if (typeof record?.turn === "number" && record.turn >= 0) setBoundaryTurn(record.turn);
						const remembered = record?.boundary;
						if (typeof record?.inheritedCount !== "number") {
							// Older thread: derive the count from the inherited marker so
							// the cut survives the fork's own renumbering.
							const known = forkBoundaryOf(child);
							const derived = inheritedCountOf(child?.getSnapshot?.(), known);
							if (derived !== null) {
								setInheritedCount(derived);
								setBoundarySource("marker-count");
								writeThread(parentId, tab.id, { inheritedCount: derived });
							}
						}
						if (typeof remembered === "number" && remembered > 0) {
							if (record?.inheritedCount === undefined || record?.inheritedCount === null) setBoundarySource("record-seq");
							settle(remembered, typeof record?.inheritedCount === "number" ? "record" : "record-seq");
							return;
						}
						const marker = forkBoundaryOf(child);
						if (marker !== null) {
							settle(marker, "marker");
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
							// No durable cut anywhere: show the stored rows and report it.
							if (!cancelled && baseline.current === null) settle(0, "none");
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
				react.useCallback((notify) => ctx.sessions.list.subscribe(notify), [ctx]),
				() => ctx.sessions.list.getSnapshot(),
				() => ctx.sessions.list.getSnapshot()
			);
			const childIsMain = childId !== "" && (listSnapshot?.current === childId || currentSessionId(ctx) === childId);

			const session = reference?.binding?.session;
			// The durable log is the transcript source; subscribe to it directly so
			// new events repaint even when the projection does not change.
			const eventSource = session?.eventSource;
			const events = react.useSyncExternalStore(
				react.useCallback((notify) => eventSource?.subscribe?.(notify) ?? (() => {}), [eventSource]),
				() => stableSessionEvents(session),
				() => stableSessionEvents(session)
			);
			const sessionSnapshot = react.useSyncExternalStore(
				react.useCallback((notify) => session?.subscribe?.(notify) ?? (() => {}), [session]),
				() => session?.getSnapshot?.() ?? null
			);

			// Fallback floor: if the fork cut could not be established, hide what was
			// already there when this panel attached and show what arrives after, so
			// the user's own new messages are never hidden by an unknown cut.
			// Declared after sessionSnapshot: reading it earlier is a TDZ crash.
			const [mountFloor, setMountFloor] = react.useState(null);
			react.useEffect(() => {
				if (sessionSnapshot === null || mountFloor !== null) return;
				const floor = lastSeqOf(sessionSnapshot);
				if (floor > 0) setMountFloor(floor);
			}, [sessionSnapshot, mountFloor]);
			const effectiveCut = boundary !== null ? boundary : mountFloor;

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

			react.useEffect(() => {
				if (childId === "" || childIsMain) return;
				// Navigation params stay on a tab after it switches children.
				// Consume their import once per tab, not once per selected child.
				if (!navigationConsumed.current && (draft !== "" || quote !== "")) {
					const navigationId = typeof params.handoffId === "string" && params.handoffId !== ""
						? params.handoffId
						: "legacy:" + tab.id + ":" + seedHashOf(JSON.stringify([draft, quote]));
					const last = readThread(parentId, tab.id)?.seedHash;
					const legacyConsumed = !params.handoffId && last !== "" &&
						(last === seedHashOf(draft) || last === seedHashOf(quote));
					if (last !== navigationId && !legacyConsumed) {
						const segments = handoffSegments(draft, quote);
						if (segments.length > 0) acceptHandoff(childId, navigationId, segments);
					}
					navigationConsumed.current = true;
					writeThread(parentId, tab.id, { seeded: true, seedHash: navigationId });
				}
				const applied = new Set();
				for (const entry of pending) {
					if (entry.tabId !== tab.id) continue;
					acceptHandoff(childId, entry.id, entry.segments);
					applied.add(entry.id);
				}
				if (applied.size > 0) {
					const remaining = pendingFor(parentId).filter((entry) => !applied.has(entry.id));
					if (remaining.length > 0) pendingDrafts.set(parentId, remaining);
					else pendingDrafts.delete(parentId);
					notifyThreads();
				}
			}, [parentId, tab.id, childId, childIsMain, draft, quote, params.handoffId, pending]);

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
				setBoundary(null);
				setBoundaryTurn(null);
				setInheritedCount(null);
				setBoundarySource("");
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
				setBoundary(null);
				setBoundaryTurn(null);
				setInheritedCount(null);
				setBoundarySource("");
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
				setBoundary(null);
				setBoundaryTurn(null);
				setInheritedCount(null);
				setBoundarySource("");
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
					: reference === null
					? react.createElement("div", { className: "dsh-sidechat-loading" }, T.preparing)
					: react.createElement(
						"div",
						{ className: "dsh-sidechat-conversation" },
						react.createElement(Diagnostics, {
							snapshot: sessionSnapshot,
							cut: effectiveCut,
							inheritedCount,
							boundarySource,
							childId,
							events
						}),
						react.createElement(Transcript, { snapshot: sessionSnapshot, cut: effectiveCut, inheritedCount, events }),
						react.createElement(SideComposer, {
							key: childId,
							session,
							childId,
							ctx,
							running: sessionSnapshot?.running === true,
							model: projectedModelSelection(ctx, parentId)?.model ?? ""
						})
					)
			);
		}

		// ── inherited-history helpers ──────────────────────────────────────

		// Filtering now happens in the plugin's own transcript renderer: a row is
		// part of this side chat exactly when its seq is above the fork cut. This
		// predicate is kept as the single definition of that rule.
		function isInheritedNode(node, boundary) {
			return boundary !== null && boundary !== undefined
				&& typeof node?.seq === "number"
				&& node.seq <= boundary;
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
			// Own transcript + composer: no dependency on host chat rendering.
			".dsh-sidechat-diagnostics{flex:none;padding:2px 12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
			".dsh-sidechat-diagnostics-toggle{border:none;background:0 0;padding:2px 0;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;cursor:pointer;text-align:left;width:100%}",
			".dsh-sidechat-diagnostics-toggle:hover{color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-diagnostics-body{padding:2px 0 6px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-family:var(--dsw-font-family-mono,ui-monospace,Menlo,monospace);word-break:break-all;user-select:text}",
			".dsh-sidechat-transcript{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 4px;display:flex;flex-direction:column;gap:10px}",
			".dsh-sidechat-row{display:flex;flex-direction:column;gap:6px;max-width:100%}",
			".dsh-sidechat-row-user{align-items:flex-end}",
			".dsh-sidechat-bubble{max-width:88%;padding:8px 10px;border-radius:12px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:pre-wrap;word-break:break-word}",
			".dsh-sidechat-rich{display:flex;flex-direction:column;gap:8px}",
			".dsh-sidechat-text{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}",
			".dsh-sidechat-code{margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-interactive-bg-hover));overflow-x:auto;font-size:12px;line-height:18px}",
			".dsh-sidechat-code code{font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);white-space:pre}",
			".dsh-sidechat-reasoning,.dsh-sidechat-context{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-reasoning summary,.dsh-sidechat-context summary{cursor:pointer;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-tool{display:flex;align-items:baseline;gap:6px;padding:4px 8px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);font-size:12px;overflow:hidden}",
			".dsh-sidechat-tool-name{flex:none;font-weight:600;color:var(--dsw-alias-state-business-primary)}",
			".dsh-sidechat-tool-args{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-error-row{font-size:12px;color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary))}",
			".dsh-sidechat-empty{padding:16px 4px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".dsh-sidechat-running{font-size:12px;color:var(--dsw-alias-label-tertiary);padding:0 2px}",
			// Composer mirrors the native one: one rounded card, quiet footer row and
			// a circular send control.
			".dsh-sidechat-composer{position:relative;flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px}",
			".dsh-sidechat-card{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;width:100%;padding:8px 8px 6px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-specific-input-major,var(--dsw-specific-menu,#fff));box-shadow:var(--dsw-elevation-panel,0 1px 2px rgba(0,0,0,.04))}",
			".dsh-sidechat-card:focus-within{border-color:var(--dsw-alias-border-l3)}",
			".dsh-sidechat-import{position:relative;padding:4px 25px 4px 6px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:110px;overflow:auto;font-size:12px;background:var(--dsw-alias-interactive-bg-hover);border-radius:5px}",
			".dsh-sidechat-import blockquote{margin:3px 0;padding-left:6px;border-left:2px solid var(--dsw-alias-border-l2)}",
			".dsh-sidechat-import strong{display:block}",
			".dsh-sidechat-import button{position:absolute;right:4px;top:2px;border:0;background:none;color:inherit;cursor:pointer}",
			".dsh-sidechat-input{box-sizing:border-box;width:100%;min-height:44px;max-height:180px;padding:2px 2px 0;border:none;background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;resize:none;outline:none;overflow-y:auto}",
			".dsh-sidechat-input::placeholder{color:var(--dsw-alias-label-caption)}",
			".dsh-sidechat-composer-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}",
			".dsh-sidechat-composer-left{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}",
			".dsh-sidechat-pill{max-width:120px;height:24px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:22px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-sidechat-pill:hover,.dsh-sidechat-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dsh-sidechat-menu-panel{position:absolute;left:10px;right:10px;bottom:calc(100% - 6px);max-height:min(50vh,320px);overflow-y:auto;padding:6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-specific-menu,#fff);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.16));z-index:30}",
			".dsh-sidechat-menu-group{padding:2px 0 4px}",
			".dsh-sidechat-menu-group-name{padding:4px 6px;font-size:11px;color:var(--dsw-alias-label-caption)}",
			".dsh-sidechat-menu-row{display:block;width:100%;text-align:left;border:none;background:0 0;border-radius:8px;padding:6px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".dsh-sidechat-menu-row:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dsh-sidechat-menu-row.is-current{color:var(--dsw-alias-state-business-primary);font-weight:600}",
			".dsh-sidechat-composer-right{display:flex;align-items:center;gap:8px}",
			".dsh-sidechat-model{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-sidechat-send{width:30px;height:30px;display:grid;place-items:center;border:none;border-radius:50%;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:15px;line-height:1;cursor:pointer;padding:0}",
			".dsh-sidechat-send:disabled{opacity:.4;cursor:default}",
			".dsh-sidechat-send.is-stop{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base,#fff);font-size:11px}",
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

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: IMPL,
				inject: (sessionId) => ({ ctx, sessionId })
			}, (props) => react.createElement(PanelBoundary, null, react.createElement(Panel, props)))), "dsh-sidechat: panel body");

			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: IMPL,
				inject: (sessionId) => ({ ctx, sessionId })
			}, TabTitle)), "dsh-sidechat: tab title");

			ctx.effect(() => registerSessionListFilter(ctx), "dsh-sidechat: session list filter");

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
			openSideChat,
			threadLabel,
			relativeTime,
			threadRequestFor: (parentId) => threadRequests.get(parentId) ?? null,
			forkBoundaryOf,
			lastSeqOf,
			sideRows,
			inheritedCountOf,
			diagnosticsOf,
			modelFace,
			permissionFace,
			permissionValueOf,
			loadModelCatalog,
			loadPermissionCatalog,
			selectSideModel,
			selectPermission,
			sessionEvents,
			stableSessionEvents,
			inheritedMarkerIndex,
			rowsFromEvents,
			eventTranscript,
			forkCutOf,
			forkPrefixOf,
			isInheritedNode,
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
