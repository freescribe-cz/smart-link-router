// popup logic

async function getCurrentTab() {
   const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
   return tabs[0];
}

function truncate(s, n) {
   return s && s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function load() {
   const statusEl = document.getElementById("status");
   const selectEl = document.getElementById("windowSelect");
   const setBtn = document.getElementById("setBtn");
   const clearBtn = document.getElementById("clearBtn");

   const tab = await getCurrentTab();
   if (!tab || !tab.id) {
      statusEl.textContent = "No active tab.";
      return;
   }

   // Ask background for windows
   const winsRes = await chrome.runtime.sendMessage({ type: "get-all-windows" });
   const windows = winsRes?.windows || [];

   // Ask background for current route
   const routeRes = await chrome.runtime.sendMessage({
      type: "get-route-for-tab-explicit",
      tabId: tab.id
   });
   const currentRoute = routeRes?.windowId || null;

   // Build dropdown
   selectEl.innerHTML = "";

   for (const w of windows) {
      // Skip the window the tab is currently in
      if (w.id === tab.windowId) continue;

      const activeTab = (w.tabs || []).find(t => t.active);
      const title = truncate(activeTab?.title || `Window ${w.id}`, 30);
      const count = w.tabs?.length ?? 0;

      const opt = document.createElement("option");
      opt.value = String(w.id);
      opt.textContent = `${title} (${count} tabs)`;

      if (currentRoute === w.id) {
         opt.selected = true;
      }

      selectEl.appendChild(opt);
   }

   if (selectEl.options.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No other windows available";
      selectEl.appendChild(opt);
      selectEl.disabled = true;
      setBtn.disabled = true;
   }

   // Status text
   if (currentRoute) {
      statusEl.textContent = `This tab is routed to window ${currentRoute}.`;
   } else {
      statusEl.textContent = "This tab has no route.";
   }

   // Wire buttons
   setBtn.onclick = async () => {
      const val = selectEl.value;
      if (!val) return;

      const targetWindowId = Number(val);

      await chrome.runtime.sendMessage({
         type: "set-route",
         tabId: tab.id,
         windowId: targetWindowId
      });

      window.close();
   };

   clearBtn.onclick = async () => {
      await chrome.runtime.sendMessage({
         type: "clear-route",
         tabId: tab.id
      });
      window.close();
   };
}

document.addEventListener("DOMContentLoaded", load);
