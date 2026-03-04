(function () {
  'use strict';

  var WIDGET_URL = (window.EFRO_CONFIG && window.EFRO_CONFIG.widgetUrl)
    || 'https://mascotbot-fresh.vercel.app';
  var SHOP = (window.EFRO_CONFIG && window.EFRO_CONFIG.shop)
    || (window.Shopify && window.Shopify.shop)
    || window.location.hostname;

  // Derive the trusted widget origin for message verification
  var widgetOrigin;
  try {
    widgetOrigin = new URL(WIDGET_URL).origin;
  } catch (e) {
    widgetOrigin = WIDGET_URL;
  }

  // Create iframe
  var iframe = document.createElement('iframe');
  var src;
  try {
    var u = new URL(WIDGET_URL);
    u.searchParams.set('shop', SHOP);
    src = u.toString();
  } catch (e) {
    src = WIDGET_URL + '/?shop=' + encodeURIComponent(SHOP);
  }
  iframe.src = src;
  iframe.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:380px',
    'height:620px',
    'border:none',
    'border-radius:16px',
    'box-shadow:0 4px 32px rgba(0,0,0,0.18)',
    'z-index:999999',
    'background:transparent',
  ].join(';');
  iframe.allow = 'microphone';
  iframe.title = 'EFRO KI Verkaufsassistent';
  document.body.appendChild(iframe);

  // Listen for navigation messages from widget
  window.addEventListener('message', function (event) {
    // Only trust messages from the widget origin
    if (event.origin !== widgetOrigin) return;
    if (!event.data || event.data.type !== 'EFRO_NAVIGATE') return;
    var url = event.data.url;
    if (typeof url !== 'string' || !url.startsWith('http')) return;
    // Navigate the top-level frame (the Shopify store tab)
    window.top.location.href = url;
  });
})();
