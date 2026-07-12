(() => {
  'use strict';
  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);


  function lockPageZoom() {
    const prevent = event => {
      if (event.cancelable) event.preventDefault();
    };

    /*
      El viewport ya bloquea el zoom en Android.
      Aquí solo bloqueamos gestos de zoom específicos de Safari y los
      atajos de escritorio. No interceptamos touchmove ni touchend,
      porque esos eventos son necesarios para deslizar la página.
    */
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
      document.addEventListener(type, prevent, { passive: false });
    });

    window.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) prevent(event);
    }, { passive: false });

    window.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) {
        prevent(event);
      }
    }, { passive: false });
  }

  lockPageZoom();

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .pwa-install-btn{position:fixed;right:18px;bottom:18px;z-index:10000;border:0;border-radius:999px;padding:13px 18px;background:linear-gradient(135deg,#9c2f5c,#d9769f);color:#fff;font:800 14px/1 Inter,system-ui,sans-serif;box-shadow:0 16px 40px rgba(156,47,92,.34);display:none;align-items:center;gap:9px;cursor:pointer;transition:.25s}.pwa-install-btn:hover{transform:translateY(-2px)}.pwa-install-btn.show{display:flex}.pwa-install-toast{position:fixed;left:50%;bottom:82px;z-index:10001;transform:translate(-50%,20px);opacity:0;pointer-events:none;width:min(92vw,430px);background:#241820;color:#fff;padding:15px 18px;border-radius:16px;font:600 13px/1.45 Inter,system-ui,sans-serif;box-shadow:0 22px 60px rgba(0,0,0,.28);transition:.25s}.pwa-install-toast.show{opacity:1;transform:translate(-50%,0)}@media(max-width:600px){.pwa-install-btn{right:12px;bottom:12px;padding:12px 15px}.pwa-install-toast{bottom:72px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let el = document.querySelector('.pwa-install-toast');
    if (!el) { el = document.createElement('div'); el.className = 'pwa-install-toast'; document.body.appendChild(el); }
    el.textContent = message; el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 5200);
  }

  function createButton() {
    if (isStandalone() || document.querySelector('.pwa-install-btn')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'pwa-install-btn'; button.setAttribute('aria-label','Instalar Cielo Postres');
    button.innerHTML = '<span aria-hidden="true">📲</span> Instalar app';
    button.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        button.classList.remove('show');
        if (choice?.outcome === 'accepted') toast('Cielo Postres se está instalando.');
      } else if (isIOS) {
        toast('En iPhone: toca Compartir y luego “Agregar a pantalla de inicio”.');
      } else {
        toast('Abre el menú del navegador y selecciona “Instalar aplicación” o “Agregar a pantalla de inicio”.');
      }
    });
    if (document.querySelector('#cartbar')) button.style.bottom = '96px';
    document.body.appendChild(button);
    if (isIOS) button.classList.add('show');
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredPrompt = event;
    document.querySelector('.pwa-install-btn')?.classList.add('show');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null; document.querySelector('.pwa-install-btn')?.remove(); toast('Cielo Postres quedó instalada.');
  });

  document.addEventListener('DOMContentLoaded', () => { addStyles(); createButton(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', {scope:'/'}).catch(err => console.warn('PWA:', err)));
  }
})();
