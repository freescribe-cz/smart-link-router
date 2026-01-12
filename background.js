// --- Router brain ---

const STORAGE_KEY = "tabRoutes";
// shape: { [tabId: number]: windowId }

async function getRoutes() {
   const res = await chrome.storage.local.get(STORAGE_KEY);
   return res[STORAGE_KEY] || {};
}

async function setRoutes(routes) {
   await chrome.storage.local.set({ [STORAGE_KEY]: routes });
}

async function setRoute(tabId, windowId) {
   const routes = await getRoutes();
   routes[tabId] = windowId;
   await setRoutes(routes);
}

async function clearRoute(tabId) {
   const routes = await getRoutes();
   if (routes[tabId]) {
      delete routes[tabId];
      await setRoutes(routes);
   }
}

async function getRouteForTab(tabId) {
   const routes = await getRoutes();
   return routes[tabId] || null;
}

async function cleanupDeadWindows() {
   const routes = await getRoutes();
   const wins = await chrome.windows.getAll();
   const alive = new Set(wins.map(w => w.id));

   let changed = false;
   for (const [tabId, winId] of Object.entries(routes)) {
      if (!alive.has(winId)) {
         delete routes[tabId];
         changed = true;
      }
   }

   if (changed) {
      await setRoutes(routes);
   }
}

// --- Badge handling ---
async function updateBadgeForTab(tabId) {
   if (!tabId) return;

   const windowId = await getRouteForTab(tabId);

   if (windowId) {
      await chrome.action.setBadgeText({ tabId, text: "⯯" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#203654" });
   } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
   }
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
   (async () => {
      try {
         if (msg?.type === "get-route-for-tab") {
            const tabId = sender.tab?.id;
            if (!tabId) {
               sendResponse({ windowId: null });
               return;
            }

            const windowId = await getRouteForTab(tabId);

            // Verify window still exists
            if (windowId != null) {
               try {
                  await chrome.windows.get(windowId);
                  sendResponse({ windowId });
               } catch {
                  // dead window
                  await clearRoute(tabId);
                  sendResponse({ windowId: null });
               }
            } else {
               sendResponse({ windowId: null });
            }
            return;
         }

         if (msg?.type === "open-in-window") {
            const { url, windowId } = msg;
            if (!url || !windowId) return;

            try {
               await chrome.tabs.create({
                  windowId,
                  url,
                  active: true
               });
               await chrome.windows.update(windowId, { focused: true });
            } catch (e) {
               console.error("Failed to open in target window:", e);
            }
            return;
         }

         if (msg?.type === "set-route") {
            const { tabId, windowId } = msg;
            if (tabId && windowId) {
               await setRoute(tabId, windowId);
               await updateBadgeForTab(tabId);
            }
            sendResponse({ ok: true });
            return;
         }

         if (msg?.type === "clear-route") {
            const { tabId } = msg;
            if (tabId) {
               await clearRoute(tabId);
               await updateBadgeForTab(tabId);
            }
            sendResponse({ ok: true });
            return;
         }

         if (msg?.type === "get-all-windows") {
            const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
            sendResponse({ windows: wins });
            return;
         }

         if (msg?.type === "get-route-for-tab-explicit") {
            const { tabId } = msg;
            if (!tabId) {
               sendResponse({ windowId: null });
               return;
            }
            const windowId = await getRouteForTab(tabId);
            sendResponse({ windowId: windowId || null });
            return;
         }

      } catch (e) {
         console.error("Background error:", e);
      }
   })();

   // Important: keep message channel open for async
   return true;
});

// --- Cleanup ---

chrome.tabs.onRemoved.addListener(async (tabId) => {
   await clearRoute(tabId);
});

chrome.windows.onRemoved.addListener(async () => {
   await cleanupDeadWindows();
});

// --- Badge updates ---

chrome.tabs.onActivated.addListener(async (activeInfo) => {
   await updateBadgeForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
   if (changeInfo.status === "complete") {
      updateBadgeForTab(tabId);
   }
});
