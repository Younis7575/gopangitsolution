/* ==========================================================================
   Student Project Hub — front-end behaviour.

   Serves both /student-projects (landing: ecosystem, journey, showcase) and
   /student-projects/consultation (slot picker + both forms + lookup). Every
   block guards on its own root element, so one file can be loaded on both
   pages without branching on the URL.

   Server-side validation is authoritative: the API re-checks every field and
   re-checks slot availability before inserting. The client only gives faster
   feedback, never the final word.
   ========================================================================== */
(function () {
    'use strict';

    var API = '/api';
    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    };
    function esc(value) {
        var el = document.createElement('div');
        el.textContent = (value == null ? '' : value);
        return el.innerHTML;
    }

    /* ======================================================================
       Ecosystem switcher — /student-projects
       ====================================================================== */
    var ECO = {
        mentor: {
            icon: 'student-mentor',
            title: 'A mentor, not a ticket queue',
            text: 'You get a person who knows your project, not a shared inbox. The same consultant who scoped your project stays on it through development, so nothing has to be re-explained every time you come back with a question.',
            points: [
                'One named point of contact for the whole project',
                'Questions answered by someone who has read your brief',
                'Escalation to a developer when it is genuinely technical',
                'No repeating yourself to a new agent each session'
            ]
        },
        journey: {
            icon: 'student-journey',
            title: 'A written delivery journey',
            text: 'You are never guessing what stage your project is at. Scope, milestones and the current step are written down and shared, so a late change is a conversation about dates rather than a surprise.',
            points: [
                'Scope and explicit exclusions agreed before work starts',
                'Visible milestones rather than "we are on it"',
                'Change requests handled as scope changes, not favours',
                'A handover checklist you can tick off'
            ]
        },
        architecture: {
            icon: 'student-architecture',
            title: 'Architecture you can defend',
            text: 'The part examiners ask about most is usually the part nobody writes down. Modules, entities and relationships are designed and documented first, so the system has a reason behind its shape.',
            points: [
                'Module boundaries drawn before any code is written',
                'Database schema designed and documented',
                'Technology chosen for the requirement, not for convenience',
                'Diagrams you can put straight into your report'
            ]
        },
        documentation: {
            icon: 'student-documentation',
            title: 'Documentation, not a handover dump',
            text: 'A folder of screenshots is not documentation. Every project ships with written setup, architecture and module documentation — written while the work is fresh, not the night before submission.',
            points: [
                'Setup and installation guide',
                'System design and database schema',
                'Module-by-module documentation',
                'Written for a reader who did not build it'
            ]
        },
        code: {
            icon: 'student-code',
            title: 'Code that is yours to keep',
            text: 'You receive the full source, the schema and the build instructions. No proprietary runtime you cannot host, no licence strings tied to us, nothing switched off once you walk away.',
            points: [
                'Full source code and database schema handed over',
                'Build and run instructions that work on your machine',
                'No dependency locked to our infrastructure',
                'Clean, commented structure you can be asked about'
            ]
        },
        testing: {
            icon: 'student-testing',
            title: 'Testing you can show a panel',
            text: 'Before you demo anything, the flows you are going to demonstrate are tested. Edge cases and the awkward inputs get found on our side, not in front of your evaluation panel.',
            points: [
                'Core flows verified end to end',
                'Edge cases and invalid input handled',
                'Demo script prepared with what to click and what to say',
                'Rehearsal before the real presentation'
            ]
        },
        deployment: {
            icon: 'student-deployment',
            title: 'Deployment help for demo day',
            text: 'A project that only runs on one laptop is a project waiting to fail. We help get it onto a real host — or make the local demo environment reliable enough to trust.',
            points: [
                'Hosted deployment or a hardened local setup',
                'Database seeded and reproducible',
                'Help if the presentation-day machine misbehaves',
                'Rollback plan if something goes wrong mid-demo'
            ]
        },
        support: {
            icon: 'student-support',
            title: 'Support after the handover',
            text: 'Handover is not where the relationship ends. A warranty window covers defects after delivery, and ongoing maintenance is available if the project keeps growing.',
            points: [
                'Warranty period covering post-delivery defects',
                'Maintenance plans for hosting, updates and changes',
                'A named contact rather than a generic queue',
                'Honest advice on whether a change is worth making'
            ]
        }
    };

    function initEcosystem() {
        var list = $('#sp-eco-list');
        if (!list) { return; }
        var stage = $('#sp-eco-stage');
        var panel = $('#sp-eco-panel');
        var titleEl = $('#sp-eco-title');
        var textEl = $('#sp-eco-text');
        var pointsEl = $('#sp-eco-points');
        var iconSlot = $('.sp-eco-icon', stage);
        var nodes = $$('.sp-eco-node', list);
        var busy = false;

        function paint(key) {
            var data = ECO[key];
            if (!data) { return; }
            busy = true;
            stage.classList.add('is-swapping');
            window.setTimeout(function () {
                titleEl.textContent = data.title;
                textEl.textContent = data.text;
                pointsEl.innerHTML = data.points
                    .map(function (p) { return '<li>' + esc(p) + '</li>'; })
                    .join('');
                iconSlot.innerHTML = '';
                var mount = document.createElement('div');
                mount.className = 'gis-lottie';
                mount.setAttribute('data-lottie', data.icon);
                mount.setAttribute('data-lottie-mount', '');
                mount.setAttribute('aria-hidden', 'true');
                mount.innerHTML = '<i class="fal fa-sparkles" aria-hidden="true"></i>';
                iconSlot.appendChild(mount);
                panel.setAttribute('aria-labelledby', 'sp-eco-tab-' + key);
                /* gis-lottie.js only scans once on load, and the icon that was
                   here has just been replaced, so mount it directly. */
                if (window.GISLottie) { window.GISLottie.play(data.icon, mount); }
                stage.classList.remove('is-swapping');
                busy = false;
            }, 160);
        }

        function select(key) {
            nodes.forEach(function (n) {
                n.setAttribute('aria-selected', String(n.dataset.eco === key));
            });
            paint(key);
        }

        /* Paint the initially selected node so its detail panel matches the
           aria-selected state that is already in the markup. */
        var initial = $('.sp-eco-node[aria-selected="true"]', list) || nodes[0];
        if (initial) { select(initial.dataset.eco); }

        nodes.forEach(function (node) {
            node.addEventListener('click', function () { select(node.dataset.eco); });
            /* Keyboard users get the same behaviour the arrow keys give a
               native tablist. */
            node.addEventListener('keydown', function (e) {
                var i = nodes.indexOf(node);
                var next = null;
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { next = nodes[(i + 1) % nodes.length]; }
                if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { next = nodes[(i - 1 + nodes.length) % nodes.length]; }
                if (next) { e.preventDefault(); next.focus(); select(next.dataset.eco); }
            });
        });
    }

    /* ======================================================================
       Journey rail — /student-projects
       ====================================================================== */
    function initJourney() {
        var journey = $('#sp-journey');
        if (!journey) { return; }
        var rail = $('.sp-journey-rail span', journey);
        var steps = $$('[data-step]', journey);
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var ticking = false;

        function update() {
            ticking = false;
            var box = journey.getBoundingClientRect();
            var anchor = window.innerHeight * 0.55;

            var progress = (anchor - box.top) / Math.max(1, box.height);
            rail.style.height = (Math.min(1, Math.max(0, progress)) * 100).toFixed(2) + '%';

            var current = 0;
            steps.forEach(function (step, i) {
                var top = step.getBoundingClientRect().top;
                var inView = top < anchor;
                step.classList.toggle('is-in', inView || i === 0);
                if (inView) { current = i; }
            });
            steps.forEach(function (step, i) {
                step.classList.toggle('is-current', i === current);
            });
        }

        function onScroll() {
            if (ticking) { return; }
            ticking = true;
            window.requestAnimationFrame(update);
        }

        if (reduce) {
            steps.forEach(function (s) { s.classList.add('is-in'); });
            rail.style.height = '100%';
            return;
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();
    }

    /* ======================================================================
       Showcase — /student-projects
       ====================================================================== */
    var SHOWCASE_ICONS = {
        'mobile-apps': 'fa-mobile-alt',
        'web-applications': 'fa-globe',
        'ui-ux-design': 'fa-pen-nib',
        'ai-machine-learning': 'fa-brain',
        'erp-crm': 'fa-cubes',
        'ecommerce': 'fa-shopping-bag',
        'apis-backend': 'fa-code-branch',
        'desktop-apps': 'fa-desktop',
        'cloud-devops': 'fa-cloud',
        'other': 'fa-diagram-project'
    };

    function initShowcase() {
        var grid = $('#sp-showcase-grid');
        if (!grid) { return; }
        var loading = $('#sp-showcase-loading');
        var filters = $('#sp-showcase-filters');
        var items = [];
        var active = 'all';

        function render() {
            var visible = active === 'all'
                ? items
                : items.filter(function (i) { return i.category === active; });

            if (!visible.length) {
                grid.innerHTML =
                    '<div class="sp-empty" style="grid-column:1/-1;">' +
                    '<i class="fal fa-folder-open" aria-hidden="true"></i>' +
                    '<h3>Nothing published in this category yet</h3>' +
                    '<p>Our student showcase is filled in as projects are delivered. In the meantime, send us your brief and we will walk you through comparable work on the free consultation.</p>' +
                    '</div>';
                grid.hidden = false;
                return;
            }

            grid.innerHTML = visible.map(function (item) {
                var media = item.image_url
                    ? '<img src="' + esc(item.image_url) + '" alt="' + esc(item.image_alt || item.title) + '" loading="lazy" decoding="async">'
                    : '<span class="sp-placeholder" aria-hidden="true"><i class="fal ' +
                      esc(SHOWCASE_ICONS[item.category] || 'fa-diagram-project') + '"></i></span>';

                var tech = '';
                if (item.technologies) {
                    tech = '<div class="sp-showcase-tags">' +
                        item.technologies.split(',')
                            .map(function (t) { return t.trim(); })
                            .filter(Boolean)
                            .map(function (t) { return '<span>' + esc(t) + '</span>'; })
                            .join('') +
                        '</div>';
                }
                var link = item.external_url
                    ? '<a class="gis-link mt-3" href="' + esc(item.external_url) +
                      '" rel="noopener noreferrer" target="_blank">View project <i class="fal fa-arrow-up-right-from-square" aria-hidden="true"></i></a>'
                    : '';

                return '<article class="sp-showcase-card">' +
                    '<div class="sp-showcase-media">' +
                        '<span class="sp-showcase-cat">' + esc(item.category_label || item.category) + '</span>' +
                        media +
                    '</div>' +
                    '<div class="sp-showcase-body">' +
                        '<h3>' + esc(item.title) + '</h3>' +
                        '<p>' + esc(item.short_description) + '</p>' +
                        tech + link +
                    '</div>' +
                '</article>';
            }).join('');
            grid.hidden = false;
        }

        function renderFilters(categories) {
            var chips = [{ key: 'all', label: 'All projects' }].concat(
                Object.keys(categories).map(function (k) {
                    return { key: k, label: categories[k] };
                })
            );
            filters.innerHTML = chips.map(function (c) {
                return '<button type="button" class="sp-filter" data-cat="' + esc(c.key) +
                    '" aria-pressed="' + (c.key === active) + '">' + esc(c.label) + '</button>';
            }).join('');
        }

        filters.addEventListener('click', function (e) {
            var chip = e.target.closest('.sp-filter');
            if (!chip) { return; }
            active = chip.dataset.cat;
            $$('.sp-filter', filters).forEach(function (b) {
                b.setAttribute('aria-pressed', String(b === chip));
            });
            render();
        });

        fetch(API + '/student/showcase', { headers: { Accept: 'application/json' } })
            .then(function (r) {
                if (!r.ok) { throw new Error('Showcase unavailable'); }
                return r.json();
            })
            .then(function (body) {
                items = (body && body.data) || [];
                renderFilters((body && body.meta && body.meta.categories) || {});
                if (!items.length) {
                    /* Nothing published yet is a legitimate state, not an error,
                       so it gets the empty card rather than a broken grid. */
                    active = 'all';
                }
                render();
            })
            .catch(function () {
                loading.innerHTML =
                    '<i class="fal fa-triangle-exclamation" aria-hidden="true"></i>' +
                    '<h3 class="mt-3">Could not load the showcase</h3>' +
                    '<p class="mb-0">Refresh the page to try again, or <a href="/student-projects/consultation#request">send us your brief</a> and we will share comparable work directly.</p>';
                loading.classList.remove('d-none');
            })
            .then(function () { loading.hidden = true; });
    }

    /* ======================================================================
       Booking + request forms — /student-projects/consultation
       ====================================================================== */
    function initBooking() {
        var form = $('#sp-consultation-form');
        var projectForm = $('#sp-project-form');
        if (!form && !projectForm) { return; }

        var alertBox = $('#sp-form-alert');
        var result = $('#sp-result');
        var lastPanel = 'book';
        var dateInput = $('#c-date');
        var slotWrap = $('#c-slots');
        var slotNote = $('#c-slots-note');
        var timeInput = $('#c-time');
        var config = null;

        /* ---------- alerts ---------- */
        function alert(kind, message) {
            alertBox.textContent = message;
            alertBox.className = 'sp-alert is-visible is-' + kind;
        }
        function clearAlert() {
            alertBox.textContent = '';
            alertBox.className = 'sp-alert';
        }

        /* ---------- per-field errors ---------- */
        function clearErrors(scope) {
            $$('[data-error-for]', scope).forEach(function (p) { p.textContent = ''; });
            $$('.sp-has-error', scope).forEach(function (el) { el.classList.remove('sp-has-error'); });
        }
        function showErrors(scope, errors) {
            clearErrors(scope);
            Object.keys(errors || {}).forEach(function (field) {
                var msg = $('[data-error-for="' + field + '"]', scope);
                if (msg) {
                    msg.textContent = errors[field];
                    var control = msg.parentElement;
                    while (control && !control.classList.contains('col-12') &&
                           !control.classList.contains('col-md-6') &&
                           !control.classList.contains('col-md-3')) {
                        control = control.parentElement;
                    }
                    (control || msg.parentElement).classList.add('sp-has-error');
                }
            });
            var first = $('[data-error-for]:not(:empty)', scope);
            if (first) {
                var box = first.closest('.sp-has-error') || first.parentElement;
                var focusable = $('input,select,textarea', box);
                if (focusable) { focusable.focus(); }
            }
        }

        /* ---------- tabs ---------- */
        $$('.sp-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var target = tab.dataset.panel;
                $$('.sp-tab').forEach(function (t) {
                    t.setAttribute('aria-selected', String(t === tab));
                });
                ['book', 'request'].forEach(function (name) {
                    var panel = $('#sp-panel-' + name);
                    if (panel) { panel.hidden = (name !== target); }
                });
                clearAlert();
                history.replaceState(null, '', '#' + target);
            });
        });
        if (location.hash === '#request' || location.hash === '#book') {
            var initial = $('.sp-tab[data-panel="' + location.hash.slice(1) + '"]');
            if (initial) { initial.click(); }
        }

        /* ---------- config-driven selects ---------- */
        function fillSelect(select, map) {
            if (!select) { return; }
            var html = '<option value="">' + esc(select.options[0].textContent) + '</option>';
            Object.keys(map).forEach(function (key) {
                html += '<option value="' + esc(key) + '">' + esc(map[key]) + '</option>';
            });
            /* "Other" always stays last so it reads as the escape hatch. */
            if (map.other) {
                var other = '<option value="other">' + esc(map.other) + '</option>';
                html = html.replace(other, '') + other;
            }
            select.innerHTML = html;
        }

        function toggleCustom(select, wrapper) {
            if (!select || !wrapper) { return; }
            var on = select.value === 'other';
            wrapper.hidden = !on;
            if (!on) {
                var input = $('input', wrapper);
                if (input) { input.value = ''; }
            }
        }

        fetch(API + '/student/config', { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                config = (body && body.data) || {};
                fillSelect($('#c-category'), config.consultation_categories || {});
                fillSelect($('#p-category'), config.project_categories || {});
                fillSelect($('#p-duration'), config.durations || {});
                var duration = $('#p-duration');
                if (duration) {
                    duration.insertAdjacentHTML(
                        'beforeend', '<option value="custom">Something else</option>');
                }
                if (config.max_file_size) {
                    var mb = Math.round(config.max_file_size / (1024 * 1024));
                    ['#c-file-help', '#p-file-help'].forEach(function (sel) {
                        var el = $(sel);
                        if (el) { el.textContent += ' Maximum ' + mb + ' MB.'; }
                    });
                }
                initDateBounds();
            })
            .catch(function () {
                alert('error', 'We could not load the form options. Please refresh the page, or email info@gopangitsolution.com and we will help you directly.');
            });

        /* ---------- date bounds + slots ---------- */
        function initDateBounds() {
            if (!dateInput || !config) { return; }
            var start = new Date();
            start.setHours(0, 0, 0, 0);
            var end = new Date(start);
            end.setDate(end.getDate() + Math.max(1, config.days_ahead || 30));
            var iso = function (d) { return d.toISOString().slice(0, 10); };
            dateInput.min = iso(start);
            dateInput.max = iso(end);
            loadSlots();
        }

        function renderSlots(slots, note) {
            if (!slots || !slots.length) {
                slotWrap.innerHTML = '';
                timeInput.value = '';
                slotNote.textContent = note || 'No slots are open on this date. Try another day.';
                return;
            }
            slotWrap.innerHTML = slots.map(function (t) {
                return '<button type="button" class="sp-slot" data-slot="' + esc(t) +
                    '" aria-pressed="false">' + esc(t) + '</button>';
            }).join('');
            timeInput.value = '';
            slotNote.textContent = (config ? config.slot_start_time + '–' + config.slot_end_time : '') +
                ' · ' + (config ? config.duration_minutes : 30) + ' minutes each. Times are Pakistan Standard Time.';
        }

        var slotToken = 0;
        function loadSlots() {
            if (!dateInput || !slotWrap) { return; }
            var date = dateInput.value;
            if (!date) {
                renderSlots([], 'Choose a date to see open slots.');
                return;
            }
            var token = ++slotToken;
            slotWrap.innerHTML = '<span class="sp-slots-note mb-0">Checking availability…</span>';

            fetch(API + '/student/slots?date=' + encodeURIComponent(date), {
                headers: { Accept: 'application/json' }
            })
                .then(function (r) { return r.json(); })
                .then(function (body) {
                    if (token !== slotToken) { return; }
                    var data = (body && body.data) || {};
                    if (data.reason === 'out_of_range') {
                        renderSlots([], 'That date is outside the booking window. Please choose a date within the next ' +
                            (config ? config.days_ahead : 30) + ' days.');
                        return;
                    }
                    if (data.available && (!data.slots || !data.slots.length)) {
                        renderSlots([], 'Everything on this date is taken. Please choose another day.');
                        return;
                    }
                    renderSlots(data.slots || []);
                })
                .catch(function () {
                    if (token === slotToken) {
                        renderSlots([], 'We could not load the slots. Please refresh and try again.');
                    }
                });
        }

        if (dateInput) {
            dateInput.addEventListener('change', loadSlots);
            slotWrap.addEventListener('click', function (e) {
                var btn = e.target.closest('.sp-slot');
                if (!btn) { return; }
                $$('.sp-slot', slotWrap).forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b === btn));
                });
                timeInput.value = btn.dataset.slot;
                $('[data-error-for="preferred_time"]', form).textContent = '';
            });
        }

        /* ---------- shared submit ---------- */
        function submit(form, url, statusEl, button, onDone) {
            return function (e) {
                e.preventDefault();
                clearAlert();
                clearErrors(form);
                statusEl.textContent = '';
                button.disabled = true;
                button.dataset.label = button.textContent;
                button.textContent = 'Sending…';
                alert('busy', 'Submitting your request…');

                fetch(url, { method: 'POST', body: new FormData(form) })
                    .then(function (r) {
                        return r.json().then(function (body) {
                            return { status: r.status, body: body };
                        });
                    })
                    .then(function (res) {
                        button.disabled = false;
                        button.textContent = button.dataset.label;
                        if (res.status >= 200 && res.status < 300 && res.body && res.body.success) {
                            alert('ok', res.body.message || 'Submitted.');
                            onDone(res.body.data || {});
                            return;
                        }
                        /* 409 means somebody booked the slot first; refresh the
                           grid so the student sees what is actually left. */
                        if (res.status === 409) { loadSlots(); }
                        showErrors(form, (res.body && res.body.errors) || null);
                        alert('error', (res.body && res.body.message) || 'Something went wrong. Please try again.');
                        statusEl.textContent = '';
                    })
                    .catch(function () {
                        button.disabled = false;
                        button.textContent = button.dataset.label;
                        alert('error', 'We could not reach the server. Check your connection and try again.');
                    });
            };
        }

        /* ---------- result panel ---------- */
        function money(min, max, currency) {
            var fmt = function (n) { return Number(n).toLocaleString('en-PK'); };
            if (min != null && max != null) { return currency + ' ' + fmt(min) + ' – ' + fmt(max); }
            if (min != null) { return currency + ' ' + fmt(min) + '+'; }
            if (max != null) { return 'Up to ' + currency + ' ' + fmt(max); }
            return 'To be discussed';
        }

        function showResult(opts) {
            $('#sp-form-alert').className = 'sp-alert';
            $('#sp-result-title').textContent = opts.title;
            $('#sp-result-text').textContent = opts.text;
            $('#sp-result-ref').textContent = opts.reference;
            $('#sp-result-summary').innerHTML = opts.rows
                .map(function (r) {
                    return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
                })
                .join('');
            hidePanels();
            result.classList.add('is-visible');
            result.focus();
            result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function hidePanels() {
            ['book', 'request'].forEach(function (name) {
                var panel = $('#sp-panel-' + name);
                if (panel) { panel.hidden = true; }
            });
            $$('.sp-tabs').forEach(function (t) { t.hidden = true; });
        }

        if (form) {
            var statusEl = $('#c-status');
            var button = $('#c-submit');
            form.addEventListener('submit', submit(form, API + '/student/consultations', statusEl, button, function (data) {
                lastPanel = 'book';
                showResult({
                    title: 'Your consultation request is in',
                    text: 'We have emailed your booking reference. Our team will review the request, confirm the slot and share a Google Meet link. You can check the status any time below.',
                    reference: data.booking_reference,
                    rows: [
                        ['Booking reference', data.booking_reference],
                        ['Name', data.name],
                        ['Project category', data.project_category_label],
                        ['Date', data.preferred_date],
                        ['Time', data.preferred_time + ' (Pakistan Standard Time)'],
                        ['Duration', (data.duration_minutes || 30) + ' minutes'],
                        ['Summary', data.short_description],
                        ['Status', data.status_label || 'Pending']
                    ]
                });
                form.reset();
                if (slotWrap) { renderSlots([], 'Choose a date to see open slots.'); }
            }));

            var cat = $('#c-category');
            if (cat) {
                cat.addEventListener('change', function () {
                    toggleCustom(cat, $('[data-custom-category]', form));
                });
            }
        }

        if (projectForm) {
            var pStatus = $('#p-status');
            var pButton = $('#p-submit');
            projectForm.addEventListener('submit', submit(projectForm, API + '/student/projects', pStatus, pButton, function (data) {
                lastPanel = 'request';
                showResult({
                    title: 'Your project request has been submitted',
                    text: 'We have emailed your request reference. A consultant will review the brief and come back with a quotation and plan. Nothing is approved automatically — you decide after you see it.',
                    reference: data.request_reference,
                    rows: [
                        ['Request reference', data.request_reference],
                        ['Name', data.name],
                        ['Project category', data.project_category_label],
                        ['Expected duration', data.duration_label],
                        ['Budget range', money(data.budget_min, data.budget_max, data.currency || 'PKR')],
                        ['Summary', data.short_description],
                        ['Status', data.status_label || 'Pending review']
                    ]
                });
                projectForm.reset();
            }));

            var pCat = $('#p-category');
            if (pCat) {
                pCat.addEventListener('change', function () {
                    toggleCustom(pCat, $('[data-custom-category]', projectForm));
                });
            }
            var duration = $('#p-duration');
            if (duration) {
                duration.addEventListener('change', function () {
                    var wrap = $('[data-custom-duration]', projectForm);
                    if (wrap) { wrap.hidden = duration.value !== 'custom'; }
                });
            }
        }

        /* ---------- result panel actions ---------- */
        var again = $('#sp-result-again');
        if (again) {
            again.addEventListener('click', function () {
                result.classList.remove('is-visible');
                /* Restore the form the visitor actually submitted from, not
                   whichever tab happens to be marked selected in the DOM. */
                $$('.sp-tabs').forEach(function (t) { t.hidden = false; });
                var tab = $('.sp-tab[data-panel="' + lastPanel + '"]') || $('.sp-tab');
                if (tab) { tab.click(); }
                clearAlert();
            });
        }

        var copyBtn = $('#sp-copy-ref');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var ref = $('#sp-result-ref').textContent.trim();
                var done = function () {
                    copyBtn.innerHTML = '<i class="fal fa-check" aria-hidden="true"></i>';
                    window.setTimeout(function () {
                        copyBtn.innerHTML = '<i class="fal fa-copy" aria-hidden="true"></i>';
                    }, 2000);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(ref).then(done, function () { alert('error', 'Copy failed — please select and copy ' + ref + ' manually.'); });
                } else {
                    alert('error', 'Copy is unavailable in this browser. Your reference is ' + ref + '.');
                }
            });
        }

        /* ---------- reference lookup ---------- */
        var lookupForm = $('#sp-lookup-form');
        if (lookupForm) {
            var lookupResult = $('#sp-lookup-result');
            lookupForm.addEventListener('submit', function (e) {
                e.preventDefault();
                clearErrors(lookupForm);
                var ref = $('#sp-lookup-ref').value.trim();
                var email = $('#sp-lookup-email').value.trim();
                var btn = $('#sp-lookup-btn');

                lookupResult.hidden = false;
                lookupResult.innerHTML = '<p class="mb-0" style="color:var(--gis-text);">Checking…</p>';

                btn.disabled = true;
                fetch(API + '/student/consultations/' + encodeURIComponent(ref) + '?email=' + encodeURIComponent(email), {
                    headers: { Accept: 'application/json' }
                })
                    .then(function (r) {
                        return r.json().then(function (body) { return { status: r.status, body: body }; });
                    })
                    .then(function (res) {
                        btn.disabled = false;
                        if (res.status === 200 && res.body && res.body.success) {
                            var d = res.body.data;
                            var rows = [
                                ['Booking reference', d.booking_reference],
                                ['Name', d.name],
                                ['Category', d.project_category_label],
                                ['Date', d.preferred_date],
                                ['Time', d.preferred_time + ' (Pakistan Standard Time)'],
                                ['Summary', d.short_description],
                                ['Status', d.status_label]
                            ];
                            if (d.google_meet_link) { rows.push(['Google Meet', d.google_meet_link]); }
                            lookupResult.innerHTML =
                                '<h3 style="font-family:var(--gis-display);font-size:1.05rem;margin-bottom:14px;">Booking status</h3>' +
                                '<dl class="sp-summary mb-0" style="margin:0;">' +
                                rows.map(function (r) {
                                    var value = esc(r[1]);
                                    /* Only meet.google.com / g.co is ever stored, but
                                       re-check before turning admin data into a link. */
                                    if (r[0] === 'Google Meet' && /^https:\/\/(meet\.google\.com|g\.co)\//i.test(r[1])) {
                                        value = '<a href="' + esc(r[1]) + '" rel="noopener noreferrer" target="_blank">Join the meeting</a>';
                                    }
                                    return '<div><dt>' + esc(r[0]) + '</dt><dd>' + value + '</dd></div>';
                                }).join('') +
                                '</dl>';
                            return;
                        }
                        if (res.body && res.body.errors) { showErrors(lookupForm, res.body.errors); }
                        lookupResult.innerHTML =
                            '<p class="mb-0" style="color:#ffc9c3;">' +
                            esc((res.body && res.body.message) || 'We could not find that booking.') + '</p>';
                    })
                    .catch(function () {
                        btn.disabled = false;
                        lookupResult.innerHTML =
                            '<p class="mb-0" style="color:#ffc9c3;">We could not reach the server. Please try again.</p>';
                    });
            });
        }
    }

    /* ======================================================================
       Boot
       ====================================================================== */
    function boot() {
        initEcosystem();
        initJourney();
        initShowcase();
        initBooking();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
