(function () {
  "use strict";

  function optionLabel(option) {
    return (option.textContent || "").trim();
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.enhanced === "1") return;
    if (select.closest("[data-custom-select]")) return;

    var options = Array.prototype.slice.call(select.options);
    if (!options.length) return;

    var selected = select.selectedOptions[0] || options[0];
    var root = document.createElement("div");
    root.className = "custom-select";
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

    var home = root;

    function placeMenu() {
      var rect = trigger.getBoundingClientRect();
      var gap = 6;
      var maxHeight = Math.min(window.innerHeight * 0.45, 240);
      var spaceBelow = window.innerHeight - rect.bottom - gap;
      var openUp = spaceBelow < 140 && rect.top > spaceBelow;

      menu.style.position = "fixed";
      menu.style.zIndex = "1000";
      menu.style.left = Math.round(rect.left) + "px";
      menu.style.width = Math.round(rect.width) + "px";
      menu.style.right = "auto";
      menu.style.maxHeight = maxHeight + "px";

      if (openUp) {
        menu.style.top = "auto";
        menu.style.bottom = Math.round(window.innerHeight - rect.top + gap) + "px";
      } else {
        menu.style.bottom = "auto";
        menu.style.top = Math.round(rect.bottom + gap) + "px";
      }
    }

    function close() {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      if (menu.parentNode !== home) home.appendChild(menu);
      menu.removeAttribute("style");
    }

    function open() {
      document.querySelectorAll("[data-custom-select].is-open").forEach(function (other) {
        if (other === root) return;
        other.classList.remove("is-open");
        var otherTrigger = other.querySelector(".custom-select-trigger");
        var otherMenu = other.querySelector(".custom-select-menu");
        if (otherTrigger) otherTrigger.setAttribute("aria-expanded", "false");
        if (otherMenu) {
          otherMenu.hidden = true;
          if (otherMenu.parentNode !== other) other.appendChild(otherMenu);
          otherMenu.removeAttribute("style");
        }
      });

      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      document.body.appendChild(menu);
      menu.hidden = false;
      placeMenu();
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
        // fallback by visible text
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
      if (root.contains(event.target) || menu.contains(event.target)) return;
      close();
    });

    window.addEventListener("resize", function () {
      if (root.classList.contains("is-open")) close();
    });

    // Floating menu closes on scroll so it never drifts with the page.
    window.addEventListener(
      "scroll",
      function () {
        if (root.classList.contains("is-open")) close();
      },
      true
    );
  }

  function init() {
    document.querySelectorAll("select").forEach(enhanceSelect);
    document.querySelectorAll("[data-custom-select]").forEach(bindCustomSelect);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
