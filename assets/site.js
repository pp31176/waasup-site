// WaasUp – kleine scripts voor de site (geen externe diensten, geen cookies)
(function () {
  // Logo: valt terug op tekst als de afbeelding (nog) ontbreekt
  document.querySelectorAll('img[data-fallback]').forEach(function (img) {
    function vervang() {
      var s = document.createElement('span');
      s.className = img.getAttribute('data-fallback');
      s.innerHTML = 'Waas<span>Up</span>';
      img.replaceWith(s);
    }
    if (img.complete && img.naturalWidth === 0) vervang();
    else img.addEventListener('error', vervang);
  });

  // Fotowissel op de homepage
  var hero = document.querySelector('.hero');
  if (hero) {
    var dias = [].slice.call(hero.querySelectorAll('.dia'));
    var knoppen = [].slice.call(hero.querySelectorAll('[data-dia]'));
    var lbl = hero.querySelector('.lbl');
    var pauze = hero.querySelector('.pauze');
    var i = 0, gepauzeerd = false, hover = false;
    var rustig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function toon(n) {
      i = n;
      dias.forEach(function (d, k) {
        var aan = k === n;
        d.classList.toggle('aan', aan);
        d.setAttribute('aria-hidden', aan ? 'false' : 'true');
        var spiegel = d.classList.contains('spiegel') ? -1 : 1;
        var z = aan && !rustig && !gepauzeerd ? 1.04 : 1;
        d.style.transform = 'scale(' + spiegel * z + ',' + z + ')';
      });
      knoppen.forEach(function (b, k) { b.setAttribute('aria-current', k === n ? 'true' : 'false'); });
      if (lbl) lbl.textContent = dias[n].getAttribute('data-naam');
    }
    knoppen.forEach(function (b, k) { b.addEventListener('click', function () { toon(k); }); });
    hero.addEventListener('mouseenter', function () { hover = true; });
    hero.addEventListener('mouseleave', function () { hover = false; });
    if (pauze) pauze.addEventListener('click', function () {
      gepauzeerd = !gepauzeerd;
      pauze.setAttribute('aria-label', gepauzeerd ? 'Foto’s laten wisselen' : 'Wisselen pauzeren');
      pauze.querySelector('.ico-pauze').style.display = gepauzeerd ? 'none' : '';
      pauze.querySelector('.ico-speel').style.display = gepauzeerd ? '' : 'none';
      toon(i);
    });
    toon(0);
    setInterval(function () {
      if (gepauzeerd || hover || rustig) return;
      toon((i + 1) % dias.length);
    }, 7000);
  }

  // Eerstvolgende activiteit
  var vb = document.querySelector('[data-volgende]');
  if (vb) {
    var vandaag = new Date().toISOString().slice(0, 10);
    var items = [].slice.call(document.querySelectorAll('[data-datum]'));
    var komend = items.filter(function (e) { return e.getAttribute('data-datum') >= vandaag; });
    // Een activiteit met data-uitgelicht gaat voor, zolang ze niet voorbij is
    var uit = komend.filter(function (e) { return e.hasAttribute('data-uitgelicht'); })[0];
    var v = uit || komend[0] || items[items.length - 1];
    if (v) {
      vb.querySelectorAll('[data-v]').forEach(function (el) {
        var w = v.getAttribute('data-' + el.getAttribute('data-v'));
        if (w === null && el.getAttribute('data-v') === 'polaroid') w = v.getAttribute('data-titel');
        if (w !== null) el.textContent = w;
      });
      var img = vb.querySelector('[data-v-beeld]');
      if (img) {
        var b = v.getAttribute('data-beeld');
        img.src = b || 'images/vos-sleutel.png';
        img.alt = v.getAttribute('data-beeldtekst') || 'De WaasUp-vos';
        img.parentNode.classList.toggle('licht', !!b);
      }
    }
  }

  // Laatste nieuws van Instagram (opgehaald door GitHub Actions, staat op de site zelf: geen Meta-cookies)
  // Voorbeeld bekijken zonder echte posts: voeg ?voorbeeld toe aan het adres.
  var nb = document.querySelector('[data-insta]');
  if (nb) {
    var voorbeeld = /[?&]voorbeeld\b/.test(location.search);
    var proef = [
      { datum: '2026-11-08T10:00:00Z', soort: 'foto', beeld: 'images/kerk.jpg', tekst: 'Zondagochtend op de Markt. Wat maakt Temse voor jou de moeite? Laat het ons weten! #WaasUp #Temse', link: '#' },
      { datum: '2026-11-04T17:30:00Z', soort: 'video', beeld: 'images/hondenwandeling.png', tekst: 'Save the date: onze Hondenwandeling op zondag 25 april 2027, vanaf 10 uur bij de Scouts in Steendorp. 🐾', link: '#' },
      { datum: '2026-10-29T12:00:00Z', soort: 'foto', beeld: 'images/kraan.jpg', tekst: 'De Boelwerfkraan: al jaren een baken aan de Schelde. Ken jij het verhaal erachter?', link: '#' }
    ];
    function datumTekst(d) {
      try { return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
    }
    function toonNieuws(posts) {
      if (!posts || !posts.length) return;
      nb.innerHTML = '';
      posts.forEach(function (p) {
        var a = document.createElement('a');
        a.className = 'post';
        a.href = p.link || '#';
        a.rel = 'noopener';
        var fig = document.createElement('span');
        fig.className = 'post-beeld' + (p.soort === 'video' ? ' video' : '');
        var img = document.createElement('img');
        img.src = p.beeld; img.alt = ''; img.loading = 'lazy';
        fig.appendChild(img);
        var dt = document.createElement('span');
        dt.className = 'post-datum'; dt.textContent = datumTekst(p.datum);
        var tx = document.createElement('span');
        tx.className = 'post-tekst'; tx.textContent = p.tekst || '';
        a.appendChild(fig); a.appendChild(dt); a.appendChild(tx);
        a.setAttribute('aria-label', (p.soort === 'video' ? 'Video' : 'Foto') + ' van ' + datumTekst(p.datum) + ' op Instagram: ' + (p.tekst || ''));
        nb.appendChild(a);
      });
      nb.hidden = false;
      document.querySelectorAll('[data-insta-ander]').forEach(function (el) { el.hidden = true; });
      var t = document.getElementById('beeld');
      if (t) t.textContent = 'Het laatste van WaasUp.';
    }
    if (voorbeeld) toonNieuws(proef);
    else if (window.fetch) {
      fetch('data/instagram.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j) toonNieuws(j.posts); })
        .catch(function () {});
    }
  }

  // Partnerpakketten: knop kiest meteen het pakket in het formulier
  document.querySelectorAll('[data-pakket]').forEach(function (a) {
    a.addEventListener('click', function () {
      var r = document.querySelector('input[name="pakket"][value="' + a.getAttribute('data-pakket') + '"]');
      if (r) r.checked = true;
    });
  });

  // Formulieren: controleren en voorlopig doorsturen per e-mail naar info@waasup.be
  document.querySelectorAll('form[data-onderwerp]').forEach(function (f) {
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fout = f.querySelector('.fout');
      var data = new FormData(f);
      var verplicht = (f.getAttribute('data-verplicht') || '').split(',').filter(Boolean);
      for (var k = 0; k < verplicht.length; k++) {
        if (!String(data.get(verplicht[k]) || '').trim()) {
          fout.textContent = 'Vul alle verplichte velden in.';
          f.querySelector('[name="' + verplicht[k] + '"]').focus();
          return;
        }
      }
      var mail = String(data.get('email') || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { fout.textContent = 'Vul een geldig e-mailadres in.'; return; }
      var ak = f.querySelector('[name="akkoord"]');
      if (ak && !ak.checked) { fout.textContent = 'Vink de toestemming aan om verder te gaan.'; return; }
      fout.textContent = '';
      var regels = [];
      data.forEach(function (waarde, sleutel) { if (sleutel !== 'akkoord') regels.push(sleutel + ': ' + waarde); });
      if (ak) regels.push('toestemming: ja');
      var url = 'mailto:info@waasup.be?subject=' + encodeURIComponent(f.getAttribute('data-onderwerp')) +
        '&body=' + encodeURIComponent(regels.join('\n'));
      var vak = f.closest('.vak');
      vak.querySelectorAll('[data-naam]').forEach(function (el) { el.textContent = String(data.get('voornaam') || data.get('naam') || '').trim(); });
      vak.classList.add('verzonden');
      window.location.href = url;
    });
  });
})();
