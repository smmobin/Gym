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
    if (select.closest(".form-grid, .trial-form, label")) return "is-block";
    if (select.closest(".row-item, .panel-head, .inline-actions, .topbar-actions")) {
      return "is-compact";
    }
    return "is-block";
  }

  function placeholderFor(select) {
    if (select.getAttribute("data-placeholder")) return select.getAttribute("data-placeholder");
    if (select.required) return "انتخاب کنید…";
    return "—";
  }

  function buildMenuItems(select, menu) {
    menu.innerHTML = "";
    var options = Array.prototype.slice.call(select.options);
    if (!options.length) {
      var empty = document.createElement("li");
      empty.className = "custom-select-empty";
      empty.setAttribute("aria-disabled", "true");
      empty.textContent = "موردی نیست";
      menu.appendChild(empty);
      return;
    }
    options.forEach(function (opt, index) {
      var item = document.createElement("li");
      item.setAttribute("role", "option");
      item.tabIndex = -1;
      item.dataset.value = opt.value;
      item.dataset.index = String(index);
      item.textContent = optionLabel(opt) || placeholderFor(select);
      if (opt.disabled) {
        item.setAttribute("aria-disabled", "true");
        item.classList.add("is-disabled");
      }
      item.setAttribute("aria-selected", opt.selected ? "true" : "false");
      menu.appendChild(item);
    });
  }

  function syncTrigger(select, valueEl) {
    var selected = select.selectedOptions[0];
    if (selected && optionLabel(selected)) {
      valueEl.textContent = optionLabel(selected);
      valueEl.classList.remove("is-placeholder");
    } else {
      valueEl.textContent = placeholderFor(select);
      valueEl.classList.add("is-placeholder");
    }
  }

  function syncSelect(select) {
    if (!select || select.tagName !== "SELECT") return;
    if (select.classList.contains("custom-select-skip")) return;

    if (select.dataset.enhanced !== "1") {
      enhanceSelect(select);
      return;
    }

    var root = select.closest("[data-custom-select]");
    if (!root) return;
    var valueEl = root.querySelector(".custom-select-value");
    var menu = root.querySelector(".custom-select-menu");
    var trigger = root.querySelector(".custom-select-trigger");
    if (!valueEl || !menu) return;

    buildMenuItems(select, menu);
    syncTrigger(select, valueEl);
    if (trigger) {
      trigger.disabled = !!select.disabled;
      root.classList.toggle("is-disabled", !!select.disabled);
    }
  }

  function enhanceSelect(select) {
    if (!select || select.tagName !== "SELECT") return;
    if (select.dataset.enhanced === "1") {
      syncSelect(select);
      return;
    }
    if (select.closest("[data-custom-select]")) return;
    if (select.classList.contains("custom-select-native")) return;
    if (select.classList.contains("custom-select-skip")) return;
    if (!select.parentNode) return;

    var root = document.createElement("div");
    root.className = "custom-select " + sizeClassFor(select);
    root.setAttribute("data-custom-select", "");
    if (select.disabled) root.classList.add("is-disabled");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.disabled = !!select.disabled;

    var valueEl = document.createElement("span");
    valueEl.className = "custom-select-value";

    var caret = document.createElement("span");
    caret.className = "custom-select-caret";
    caret.setAttribute("aria-hidden", "true");

    trigger.appendChild(valueEl);
    trigger.appendChild(caret);

    var menu = document.createElement("ul");
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    buildMenuItems(select, menu);
    syncTrigger(select, valueEl);

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
      if (native.disabled) return;
      syncSelect(native);

      document.querySelectorAll("[data-custom-select].is-open").forEach(function (other) {
        if (other === root) return;
        other.classList.remove("is-open");
        var otherMenu = other.querySelector(".custom-select-menu");
        var otherTrigger = other.querySelector(".custom-select-trigger");
        if (otherMenu) otherMenu.hidden = true;
        if (otherTrigger) otherTrigger.setAttribute("aria-expanded", "false");
      });
      document.querySelectorAll("[data-time-picker].is-open").forEach(function (tp) {
        tp.classList.remove("is-open");
        var pop = tp.querySelector(".time-picker-pop");
        var t = tp.querySelector(".time-picker-trigger");
        if (pop) pop.hidden = true;
        if (t) t.setAttribute("aria-expanded", "false");
      });

      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      var selected = menu.querySelector('[aria-selected="true"]');
      if (selected && selected.focus) selected.focus();
    }

    function selectOption(option) {
      if (!option || !option.getAttribute) return;
      if (option.getAttribute("aria-disabled") === "true") return;
      var value = option.getAttribute("data-value");
      var index = Number(option.getAttribute("data-index"));
      if (value !== null) {
        native.value = value;
      } else if (!Number.isNaN(index) && native.options[index]) {
        native.selectedIndex = index;
      }
      syncSelect(native);
      native.dispatchEvent(new Event("input", { bubbles: true }));
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
      } else if (event.key === "Escape") {
        close();
      }
    });

    menu.addEventListener("keydown", function (event) {
      var options = Array.prototype.slice.call(
        menu.querySelectorAll('[role="option"]:not([aria-disabled="true"])'),
      );
      var index = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        trigger.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!options.length) return;
        options[Math.min(Math.max(index, 0) + 1, options.length - 1)].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!options.length) return;
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

    native.addEventListener("change", function () {
      syncTrigger(native, valueEl);
      menu.querySelectorAll('[role="option"]').forEach(function (item) {
        item.setAttribute(
          "aria-selected",
          item.getAttribute("data-value") === native.value ? "true" : "false",
        );
      });
    });
  }

  function refresh(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll("select").forEach(function (select) {
      if (select.dataset.enhanced === "1") syncSelect(select);
      else enhanceSelect(select);
    });
    root.querySelectorAll("[data-custom-select]").forEach(bindCustomSelect);
  }

  function init() {
    refresh(document);
    if (typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === "childList" && m.target && m.target.tagName === "SELECT") {
          syncSelect(m.target);
          return;
        }
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

  window.GymCustomSelect = {
    refresh: refresh,
    enhance: enhanceSelect,
    sync: syncSelect,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
