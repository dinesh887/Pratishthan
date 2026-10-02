/* =====================================================================
   GALLERY — मागील वर्षाचे क्षणचित्रे (दिवाळी गडकोट स्पर्धा २०२५)

   Photos are read from:  images/gallery/gadkot-01.jpg, gadkot-02.jpg, ...
   The script checks 01, 02, 03 ... in order and stops at the first number
   that is missing, so the gallery adjusts itself to however many photos
   you upload (fewer or more than 12). If NO photo is found, the whole
   gallery section (and its menu link) stays hidden.

   This file is independent: it does not touch script.js (registration /
   Google Apps Script code).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var FOLDER  = 'images/gallery/';            // relative path (works on Vercel)
  var PREFIX  = 'gadkot-';
  var EXTS    = ['jpg', 'jpeg', 'png', 'webp']; // .jpg first; others only as fallback
  var MAX     = 100;                          // safety limit
  var BATCH   = 12;                           // photos checked at once
  var CAPTION = 'गडकोट स्पर्धा २०२५';

  var section = document.getElementById('gallery');
  var grid    = document.getElementById('galGrid');
  var lb      = document.getElementById('galLightbox');
  if (!section || !grid || !lb) return;

  var lbImg   = document.getElementById('galLbImg');
  var lbCount = document.getElementById('galLbCount');
  var btnClose = document.getElementById('galClose');
  var btnPrev  = document.getElementById('galPrev');
  var btnNext  = document.getElementById('galNext');
  var navItem  = document.getElementById('navGallery');

  var photos = [];          // list of found image URLs
  var current = 0;
  var lastFocus = null;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMr(n) { return String(n).replace(/\d/g, function (d) { return '०१२३४५६७८९'[d]; }); }

  /* ---------- Find which photos exist ---------- */
  function imageExists(url) {                   // fallback (e.g. file:// preview)
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(true); };
      im.onerror = function () { resolve(false); };
      im.src = url;
    });
  }
  function exists(url) {
    // HEAD request: checks the file without downloading the whole photo
    return fetch(url, { method: 'HEAD' }).then(function (r) {
      var type = r.headers.get('content-type') || '';
      return r.ok && (!type || type.indexOf('image/') === 0);
    }).catch(function () { return imageExists(url); });
  }
  function findPhoto(n) {
    var i = 0;
    function next() {
      if (i >= EXTS.length) return Promise.resolve(null);
      var url = FOLDER + PREFIX + pad(n) + '.' + EXTS[i++];
      return exists(url).then(function (ok) { return ok ? url : next(); });
    }
    return next();
  }

  function discover(start) {
    if (start > MAX) return Promise.resolve();
    var jobs = [];
    for (var n = start; n < start + BATCH && n <= MAX; n++) jobs.push(findPhoto(n));
    return Promise.all(jobs).then(function (urls) {
      var stopped = false;
      for (var k = 0; k < urls.length; k++) {
        if (!urls[k]) { stopped = true; break; }
        addPhoto(urls[k]);
      }
      if (!stopped) return discover(start + BATCH);
    });
  }

  /* ---------- Build grid ---------- */
  function addPhoto(url) {
    var index = photos.length;
    photos.push(url);

    var li  = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gal-item';
    btn.setAttribute('aria-label', CAPTION + ' – फोटो ' + toMr(index + 1) + ' मोठा पहा');

    var img = document.createElement('img');
    img.src = url;
    img.alt = CAPTION + ' – फोटो ' + toMr(index + 1);
    img.loading = 'lazy';
    img.decoding = 'async';

    var ov = document.createElement('span');
    ov.className = 'gal-overlay';
    ov.textContent = CAPTION;

    btn.appendChild(img);
    btn.appendChild(ov);
    btn.addEventListener('click', function () { openLightbox(index); });
    li.appendChild(btn);
    grid.appendChild(li);

    if (section.hidden) {                       // first photo found -> show section
      section.hidden = false;
      if (navItem) navItem.hidden = false;
      try { bootstrap.ScrollSpy.getOrCreateInstance(document.body).refresh(); } catch (e) {}
    }
  }

  /* ---------- Lightbox ---------- */
  function show(i) {
    current = (i + photos.length) % photos.length;
    lbImg.src = photos[current];
    lbImg.alt = CAPTION + ' – फोटो ' + toMr(current + 1);
    lbCount.textContent = toMr(current + 1) + ' / ' + toMr(photos.length);
    // preload neighbours for smooth next / previous
    [1, -1].forEach(function (d) {
      var im = new Image();
      im.src = photos[(current + d + photos.length) % photos.length];
    });
  }
  function isOpen() { return lb.classList.contains('open'); }
  function openLightbox(i) {
    lastFocus = document.activeElement;
    lb.classList.toggle('single', photos.length < 2);
    show(i);
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
  }
  function closeLightbox() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lbImg.removeAttribute('src');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function prev() { show(current - 1); }
  function next() { show(current + 1); }

  btnClose.addEventListener('click', closeLightbox);
  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);
  lb.addEventListener('click', function (e) {   // click on dark background closes
    if (e.target === lb || e.target.classList.contains('gal-lb-figure')) closeLightbox();
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
    else if (e.key === 'ArrowLeft' && photos.length > 1) { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight' && photos.length > 1) { e.preventDefault(); next(); }
    else if (e.key === 'Tab') {                 // keep keyboard focus inside the lightbox
      var f = [btnClose, btnPrev, btnNext].filter(function (b) { return b.offsetParent !== null; });
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* Swipe left / right on mobile */
  var startX = null;
  lb.addEventListener('touchstart', function (e) { startX = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (startX === null || photos.length < 2) return;
    var dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  /* ---------- Go ---------- */
  discover(1);
})();
