// ==UserScript==
// @name         OpenProject: Copy internal ID
// @namespace    https://www.openproject.org/
// @version      1.0.0
// @description  Adds "Copy internal ID (#123)" to the work package context menus when semantic IDs are on.
// @match        http://localhost/*
// @match        http://localhost:*/*
// @match        https://*.openproject.com/*
// @match        https://*.openproject-edge.com/*
// @match        https://*.openproject-dev.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ITEM_CLASS = 'tm-copy-internal-id';
  const COPY_ID_ICON = 'icon-clipboard';
  const DISPLAYED_ID = /\(\s*["'“”„«»]?([^()"'“”„«»]+)["'“”„«»]?\s*\)\s*$/;
  const CLASSIC_ID = /^#?\d+$/;

  if (!document.querySelector('meta[name="app_base_path"]')) return;

  const basePath = document.querySelector('meta[name="app_base_path"]').content || '';
  let rowIdOfLastTrigger = null;

  // Angular host elements (e.g. opce-wp-split-view) also carry data-work-package-id,
  // but JSON-encoded and possibly semantic ('"DP-2"'). Only table rows hold the plain PK.
  function rememberTrigger(event) {
    const row = event.target.closest && event.target.closest('[data-work-package-id]');
    const id = row && row.dataset.workPackageId;
    rowIdOfLastTrigger = id && /^\d+$/.test(id) ? id : null;
  }

  document.addEventListener('contextmenu', rememberTrigger, true);
  document.addEventListener('pointerdown', rememberTrigger, true);

  async function numericIdFor(displayId) {
    if (rowIdOfLastTrigger) return rowIdOfLastTrigger;

    const url = new URL(`${basePath}/api/v3/work_packages/${encodeURIComponent(displayId)}`, window.location.origin);
    const response = await fetch(url.href, {
      credentials: 'same-origin',
      headers: { Accept: 'application/hal+json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!response.ok) throw new Error(`Work package ${displayId}: HTTP ${response.status}`);
    return String((await response.json()).id);
  }

  function closeMenu() {
    (document.getElementById('wrapper') || document.body).click();
  }

  function buildItem(copyIdLi, numericId) {
    const li = copyIdLi.cloneNode(true);
    li.classList.add(ITEM_CLASS);

    const original = li.querySelector('.menu-item');
    const button = document.createElement('button');
    button.className = 'menu-item';
    button.setAttribute('role', 'menuitem');
    button.type = 'button';
    button.append(...original.childNodes);
    original.replaceWith(button);

    const label = `Copy internal ID ("${numericId}")`;
    button.setAttribute('aria-label', label);
    button.querySelector(':scope > span').textContent = label;

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await navigator.clipboard.writeText(numericId);
      closeMenu();
    });

    return li;
  }

  async function enhance(menu) {
    if (menu.querySelector(`.${ITEM_CLASS}`)) return;

    let copyIdLi = null;
    let match = null;
    for (const icon of menu.querySelectorAll(`li .${COPY_ID_ICON}`)) {
      const li = icon.closest('li');
      match = li.textContent.trim().match(DISPLAYED_ID);
      if (match) {
        copyIdLi = li;
        break;
      }
    }
    if (!copyIdLi || CLASSIC_ID.test(match[1])) return;

    try {
      const numericId = await numericIdFor(match[1]);
      if (numericId === match[1].replace(/^#/, '')) return;
      if (menu.isConnected && !menu.querySelector(`.${ITEM_CLASS}`)) {
        copyIdLi.after(buildItem(copyIdLi, numericId));
      }
    } catch (error) {
      console.warn('[copy-internal-id]', error);
    }
  }

  new MutationObserver(() => {
    document.querySelectorAll('.op-context-menu--overlay ul.dropdown-menu').forEach(enhance);
  }).observe(document.body, { childList: true, subtree: true });
})();
