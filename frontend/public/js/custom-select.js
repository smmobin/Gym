(function () {
  "use strict";

  function optionLabel(option) {
    return (option.textContent || "").trim();
  }

  function sizeClassFor(select) {
    if (select.classList.contains("select-compact") || select.hasAttribute("data-compact")) {
      return "is-compact";
    }
    if (select.classList.contains("select-block") || select.hasAttribute("data-block")) {
      return "is-block";
    }
    // Full-width inside forms / labeled fields; compact in toolbars and list rows
    if (select.closest(".form-grid, .trial-form, label")) return "is-block";
    if (select.closest(".row-item, .panel-head, .inline-actions, .topbar-actions")) {
      return "is-compact";
    }
    return "is-block";
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.enhanced === "1") return;
    if (select.closest("[data-custom-select]")) return;
    if (select.classList.contains("custom-select-native")) return;

    var options = Array.prototype.slice.call(select.options);
    if (!options.length) return;

    var selected = select.selectedOptions[0] || options[0];
    var root = document.createElement("div");
    root.className = "custom-select " + sizeClassFor(select);
    root.setAttribute("data-custom-select", "");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    var valueEl = document.createElement("span");
    valueEl.className = "custom-select-value";
    valueEl.textContent = optionLabel(selected);

    var caret = document.createElement("span");
    caret.className = "custom-select-caret";
    caret.setAttribute("aria-hidden", "true");

    trigger.appendChild(valueEl);
    trigger.appendChild(caret);

    var menu = document.createElement("ul");
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    options.forEach(function (opt, index) {
      var item = document.createElement("li");
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.value = opt.value || String(index);
      item.textContent = optionLabel(opt);
      if (opt.selected) item.setAttribute("aria-selected", "true");
      else item.setAttribute("aria-selected", "false");
      menu.appendChild(item);
    });

    select.classList.add("custom-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.dataset.enhanced = "1";

    select.parentNode.insertBefore(root, select);
    root.appendChild(select);
    root.appendChild(trigger);
    root.appendChild(menu);

    bindCustomSelect(root);
  }

  function bindCustomSelect(root) {
    var native = root.querySelector(".custom-select-native, select");
    var trigger = root.querySelector(".custom-select-trigger");
    var valueEl = root.querySelector(".custom-select-value");
    var menu = root.querySelector(".custom-select-menu");
    if (!native || !trigger || !valueEl || !menu || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    if (menu.parentNode !== root) root.appendChild(menu);
    menu.removeAttribute("style");

    function close() {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    }

    function open() {
      document.querySelectorAll("[data-custom-select].is-open").forEach(function (other) {
        if (other === root) return;
        other.classList.remove("is-open");
        var otherMenu = other.querySelector(".custom-select-menu");
        var otherTrigger = other.querySelector(".custom-select-trigger");
        if (otherMenu) otherMenu.hidden = true;
        if (otherTrigger) otherTrigger.setAttribute("aria-expanded", "false");
      });

      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      var selected = menu.querySelector('[aria-selected="true"]');
      if (selected) selected.focus();
    }

    function selectOption(option) {
      if (!option || !option.getAttribute) return;
      var value = option.getAttribute("data-value");
      menu.querySelectorAll('[role="option"]').forEach(function (item) {
        item.setAttribute("aria-selected", item === option ? "true" : "false");
      });
      valueEl.textContent = option.textContent.trim();

      var matched = false;
      Array.prototype.forEach.call(native.options, function (opt) {
        var optValue = opt.value || String(opt.index);
        if (optValue === value || optionLabel(opt) === option.textContent.trim()) {
          opt.selected = true;
          matched = true;
        } else {
          opt.selected = false;
        }
      });
      if (!matched && native.options.length) {
        Array.prototype.forEach.call(native.options, function (opt) {
          opt.selected = optionLabel(opt) === option.textContent.trim();
        });
      }

      native.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      trigger.focus();
    }

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains("is-open")) close();
      else open();
    });

    menu.addEventListener("click", function (event) {
      var option = event.target.closest('[role="option"]');
      if (!option || !menu.contains(option)) return;
      event.preventDefault();
      event.stopPropagation();
      selectOption(option);
    });

    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    menu.addEventListener("keydown", function (event) {
      var options = Array.prototype.slice.call(menu.querySelectorAll('[role="option"]'));
      var index = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        trigger.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        options[Math.min(Math.max(index, 0) + 1, options.length - 1)].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.max(index - 1, 0)].focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectOption(document.activeElement);
      }
    });

    document.addEventListener("click", function (event) {
      if (!root.classList.contains("is-open")) return;
      if (root.contains(event.target)) return;
      close();
    });
  }

  function refresh(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll("select").forEach(enhanceSelect);
    root.querySelectorAll("[data-custom-select]").forEach(bindCustomSelect);
  }

  function init() {
    refresh(document);
    if (typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches("select")) enhanceSelect(node);
          if (node.querySelectorAll) {
            node.querySelectorAll("select").forEach(enhanceSelect);
          }
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.GymCustomSelect = { refresh: refresh, enhance: enhanceSelect };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
