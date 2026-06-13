(function () {
  'use strict';

  var SITE = {
    whatsapp: '923342322324',
    whatsappMsg: 'Hello, I am interested in your IT services and would like a free consultation.',
    email: 'gopangitsolution@gmail.com'
  };

  document.documentElement.style.scrollBehavior = 'smooth';

  function initPreloader() {
    var preloader = document.getElementById('preloader');
    if (!preloader) return;
    var hide = function () {
      preloader.classList.add('loaded');
      setTimeout(function () {
        preloader.style.display = 'none';
      }, 400);
    };
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide);
    setTimeout(hide, 2500);
  }

  function initStickyHeader() {
    var header = document.querySelector('header.header-1');
    if (!header) return;
    header.classList.add('gis-sticky-header');
    var onScroll = function () {
      header.classList.toggle('gis-header-scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('.gis-reveal');
    if (!els.length) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('gis-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach(function (el) {
      observer.observe(el);
    });
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-gis-counter]');
    if (!counters.length || !('IntersectionObserver' in window)) return;
    var run = function (el) {
      var target = parseInt(el.getAttribute('data-gis-counter'), 10);
      var suffix = el.getAttribute('data-gis-suffix') || '';
      var duration = 1800;
      var start = 0;
      var startTime = null;
      function step(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / duration, 1);
        var value = Math.floor(start + (target - start) * progress);
        el.textContent = value + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    };
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            run(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(function (c) {
      observer.observe(c);
    });
  }

  function initContactForms() {
    document.querySelectorAll('.gis-contact-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = form.querySelector('[name="name"]');
        var email = form.querySelector('[name="email"]');
        var phone = form.querySelector('[name="phone"]');
        var message = form.querySelector('[name="message"]');
        var service = form.querySelector('[name="service"]');
        var feedback = form.querySelector('.gis-form-feedback');

        if (!name || !email || !message) return;

        var body = [
          'Name: ' + name.value,
          'Email: ' + email.value,
          phone && phone.value ? 'Phone: ' + phone.value : '',
          service && service.value ? 'Service: ' + service.value : '',
          '',
          message.value
        ]
          .filter(Boolean)
          .join('\n');

        var mailto =
          'mailto:' +
          SITE.email +
          '?subject=' +
          encodeURIComponent('Consultation Request - Gopang IT Solution') +
          '&body=' +
          encodeURIComponent(body);

        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'gis-form-feedback gis-form-success';
          feedback.textContent =
            'Thank you! Your message is ready to send. We will respond within 24 business hours.';
        }

        window.location.href = mailto;
        form.reset();
      });
    });
  }

  function initLazyImages() {
    document.querySelectorAll('img:not([loading])').forEach(function (img) {
      if (!img.closest('header') && !img.closest('.logo')) {
        img.setAttribute('loading', 'lazy');
      }
    });
  }

  function initWhatsApp() {
    if (document.querySelector('.gis-whatsapp-float')) return;
    var url =
      'https://wa.me/' +
      SITE.whatsapp +
      '?text=' +
      encodeURIComponent(SITE.whatsappMsg);
    var a = document.createElement('a');
    a.href = url;
    a.className = 'gis-whatsapp-float';
    a.setAttribute('aria-label', 'Chat on WhatsApp for free consultation');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.innerHTML =
      '<span class="gis-whatsapp-pulse" aria-hidden="true"></span>' +
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    document.body.appendChild(a);
  }

  function initFaqSchemaToggle() {
    document.querySelectorAll('.accordion-button').forEach(function (btn) {
      btn.setAttribute('aria-expanded', btn.classList.contains('collapsed') ? 'false' : 'true');
    });
  }

  function initMobileNavigation() {
    var hamburger = document.getElementById('hamburger');
    var mobileNav = document.querySelector('.mobile-nav');
    var closeNav = document.querySelector('.close-nav');
    var overlay = document.querySelector('.overlay');

    if (!hamburger || !mobileNav) return;

    function openMenu() {
      mobileNav.classList.add('show');
      if (overlay) overlay.classList.add('active');
    }

    function closeMenu() {
      mobileNav.classList.remove('show');
      if (overlay) overlay.classList.remove('active');
    }

    hamburger.addEventListener('click', openMenu);
    hamburger.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      }
    });

    if (closeNav) closeNav.addEventListener('click', closeMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);
  }

  function init() {
    initPreloader();
    initStickyHeader();
    initMobileNavigation();
    initScrollReveal();
    initCounters();
    initContactForms();
    initLazyImages();
    initWhatsApp();
    initFaqSchemaToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
