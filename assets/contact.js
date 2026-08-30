/**
 * assets/contact.js — makes "Send a note" an API call instead of a redirect.
 *
 * The form still carries its FormSubmit action, so with JS off (or if every mail
 * provider is down) it posts the old way and lands on /thanks. With JS on it
 * POSTs /api/contact, which mails through Resend and answers on the page — no
 * third-party hop, no page change.
 *
 * The API lives on Vercel only, so the Pages copy talks to the Vercel host
 * cross-origin; /api/blog/social already sends Access-Control-Allow-Origin: *.
 */
(function () {
  'use strict';
  var API = (location.hostname === 'hariomlohardev.vercel.app' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? '/api/contact'
    : 'https://hariomlohardev.vercel.app/api/contact';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function status(form, msg, bad) {
    var box = form.querySelector('.cf-status');
    if (!box) {
      box = document.createElement('span');
      box.className = 'cf-status';
      box.setAttribute('role', 'status');
      box.style.cssText = 'font-family:var(--mono);font-size:11px;line-height:1.5;display:block;margin-top:6px';
      (form.querySelector('.cf-actions') || form).appendChild(box);
    }
    box.style.color = bad ? 'var(--red, #E10600)' : 'var(--muted, #6E7D9A)';
    box.textContent = msg;
  }

  function done(form, name) {
    form.innerHTML =
      '<div class="cf-head"><span>Note sent ✓</span><span class="sub">usually a reply within 24h</span></div>' +
      '<div class="cf-fields"><p style="font-family:var(--mono);font-size:12px;line-height:1.7">' +
      'Thanks' + (name ? ', <b>' + esc(name) + '</b>' : '') + ' — it is in my inbox. ' +
      'Replies come from <a href="mailto:hariomlohar.new@gmail.com">hariomlohar.new@gmail.com</a>.' +
      '</p></div>';
  }

  function wire(form) {
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) return; // let the browser show its own hints
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var label = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      status(form, 'Sending…', false);

      var fd = new FormData(form);
      var body = {
        name: fd.get('name') || '',
        email: fd.get('email') || '',
        message: fd.get('message') || '',
        _honey: fd.get('_honey') || '',
        page: location.href
      };

      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; });
      }).then(function (out) {
        if (out.r.ok && out.j.ok) return done(form, body.name);
        // a bad field is worth showing; anything else means the API could not
        // deliver, so hand the note to the plain POST rather than lose it
        if (out.r.status === 400 || out.r.status === 429) {
          if (btn) { btn.disabled = false; btn.textContent = label; }
          return status(form, out.j.error || 'Could not send — check the fields.', true);
        }
        status(form, 'Switching to the backup route…', false);
        form.submit();
      }).catch(function () {
        status(form, 'Switching to the backup route…', false);
        form.submit();
      });
    });
  }

  var forms = document.querySelectorAll('form.contact-form');
  for (var i = 0; i < forms.length; i++) wire(forms[i]);
})();
