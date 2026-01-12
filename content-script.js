// Intercepts normal left-clicks on links and asks background if they should be routed

function isNormalLeftClick(event) {
   if (event.button !== 0) return false;
   if (event.defaultPrevented) return false;
   if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
   return true;
}

function findAnchor(element) {
   return element?.closest?.("a[href]") || null;
}

document.addEventListener("click", (event) => {
   if (!isNormalLeftClick(event)) return;

   const anchor = findAnchor(event.target);
   if (!anchor) return;

   const target = anchor.getAttribute("target");
   if (target && target !== "_self" && target !== "_blank") return;

   const hrefAttr = anchor.getAttribute("href");
   // Ignore JS-only, dummy links, same-page links
   if (
      !hrefAttr ||
      hrefAttr.startsWith("#") ||
      hrefAttr.startsWith("javascript:")
   ) return;

   // Stop browser navigation immediately
   event.preventDefault();
   event.stopImmediatePropagation();

   const href = anchor.href;
   // Ask background asynchronously
   chrome.runtime.sendMessage(
      { type: "get-route-for-tab" },
      (res) => {
         const windowId = res?.windowId;

         if (windowId) {
            // Routed → open in target window
            chrome.runtime.sendMessage({
               type: "open-in-window",
               url: href,
               windowId
            });
         } else {
            // No route → reproduce default behavior manually
            window.location.href = href;
         }
      }
   );
}, true); // capture phase
