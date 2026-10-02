/* ==========================================================================
   Student Projects admin.

   One file drives all five pages; each block guards on the element it needs,
   so /admin-student-projects/overview and /consultations can share it without
   a router. Every render escapes admin-supplied and student-supplied text
   before it reaches innerHTML.
   ========================================================================== */
(function () {
    'use strict';

    if (localStorage.getItem('isAdminLoggedIn') !== 'true') {
        window.location.replace('/admin-login');
        return;
    }

    var API = '/api/admin/student';
    var token = localStorage.getItem('adminToken') || '';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    function esc(v) {
        if (v == null) { return ''; }
        return String(v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
        });
    }
    function pretty(v) {
        return String(v == null ? '' : v).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    function money(v, currency) {
        if (v == null || v === '') { return '—'; }
        return (currency || 'PKR') + ' ' + Number(v).toLocaleString('en-US');
    }
    function shortDate(v) {
        if (!v) { return '—'; }
        var d = new Date(String(v).replace(' ', 'T'));
        if (isNaN(d.getTime())) { return String(v); }
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function dateTime(v) {
        if (!v) { return '—'; }
        var d = new Date(String(v).replace(' ', 'T'));
        if (isNaN(d.getTime())) { return String(v); }
        return d.toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
    function stamp(v) {
        if (!v) { return '—'; }
        var d = new Date(String(v).replace(' ', 'T'));
        return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
    }

    /* ---------- toast ---------- */
    var toastTimer;
    function toast(msg, kind) {
        var el = $('#sp-toast');
        if (!el) { return; }
        el.textContent = msg || '';
        el.className = 'sp-toast' + (msg ? ' is-visible' : '') + (kind ? ' is-' + kind : '');
        if (msg) {
            el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 4200);
        }
    }

    /* ---------- fetch ---------- */
    async function req(path, opt) {
        opt = opt || {};
        opt.headers = Object.assign({ Accept: 'application/json' }, opt.headers || {});
        if (opt.body && typeof opt.body !== 'string') {
            opt.headers['Content-Type'] = 'application/json';
            opt.body = JSON.stringify(opt.body);
        }
        if (opt.method && opt.method !== 'GET') {
            opt.headers.Authorization = 'Bearer ' + token;
        }
        var res = await fetch(API + path, opt);
        if (res.status === 401) {
            localStorage.removeItem('isAdminLoggedIn');
            localStorage.removeItem('adminToken');
            window.location.replace('/admin-login');
            throw new Error('Session expired. Please log in again.');
        }
        var body = await res.json().catch(function () { return {}; });
        if (!res.ok || body.success === false) {
            var err = new Error(body.message || 'Request failed (' + res.status + ')');
            err.errors = body.errors || null;
            throw err;
        }
        return body;
    }

    /* ---------- shared bits ---------- */
    function statusPill(status, label) {
        return '<span class="admin-status-pill sp-' + esc(status) + '">' + esc(label || pretty(status)) + '</span>';
    }

    var CONFIG = { consultation_statuses: {}, project_statuses: {} };

    function statusSelect(kind, current) {
        var map = kind === 'project' ? CONFIG.project_statuses : CONFIG.consultation_statuses;
        return '<select class="sp-status-select" data-status-kind="' + kind + '" aria-label="Change status">' +
            Object.keys(map).map(function (k) {
                return '<option value="' + esc(k) + '"' + (k === current ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
            }).join('') +
            '</select>';
    }

    function logout() {
        var btn = $('#logout');
        if (btn) { btn.addEventListener('click', function () { localStorage.clear(); window.location.replace('/admin-login'); }); }
    }
    logout();

    /* ======================================================================
       OVERVIEW
       ====================================================================== */
    async function initOverview() {
        var wrap = $('#sp-overview');
        if (!wrap) { return; }

        var trendBox = $('#sp-trend');
        var peak = 1;

        function renderTrend(trend) {
            if (!trendBox) { return; }
            trend = trend || [];
            if (!trend.length) {
                trendBox.innerHTML = '<p class="admin-empty" style="padding:28px;">No requests in the last 14 days yet.</p>';
                return;
            }
            peak = Math.max.apply(null, trend.map(function (t) {
                return Math.max(t.consultations || 0, t.projects || 0);
            })) || 1;

            /* Pad the ends so the chart always spans exactly 14 days. */
            var days = [];
            for (var i = 13; i >= 0; i--) {
                var d = new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() - i);
                var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                var hit = null;
                for (var j = 0; j < trend.length; j++) { if (trend[j].d === key) { hit = trend[j]; break; } }
                days.push({ key: key, c: hit ? (hit.consultations || 0) : 0, p: hit ? (hit.projects || 0) : 0 });
            }

            trendBox.innerHTML =
                '<div class="sp-legend">' +
                    '<span><i style="background:var(--gis-accent);"></i> Consultations</span>' +
                    '<span><i style="background:#a78bfa;"></i> Project requests</span>' +
                '</div>' +
                '<div class="sp-trend">' + days.map(function (d) {
                    return '<div class="sp-trend-day" title="' + esc(d.key) + ': ' + d.c + ' consultation(s), ' + d.p + ' project request(s)">' +
                        '<div class="sp-trend-bar" style="height:' + (d.c / peak * 100) + '%"></div>' +
                        '<div class="sp-trend-bar alt" style="height:' + (d.p / peak * 100) + '%"></div>' +
                    '</div>';
                }).join('') + '</div>' +
                '<div class="sp-trend-labels"><span>' + esc(days[0].key) + '</span><span>' + esc(days[days.length - 1].key) + '</span></div>';
        }

        function renderSessions(sel, list, empty) {
            var box = $(sel);
            if (!box) { return; }
            if (!list || !list.length) {
                box.innerHTML = '<p class="admin-empty" style="padding:22px;margin:0;">' + esc(empty) + '</p>';
                return;
            }
            box.innerHTML = '<div class="sp-session-list">' + list.map(function (r) {
                return '<div class="sp-session">' +
                    '<div><div class="sp-session-when">' + esc(r.preferred_date || '') + (r.preferred_time ? ' · ' + esc(r.preferred_time) : '') + '</div>' +
                    '<div class="sp-session-who">' + esc(r.name) + '<small>' + esc(r.booking_reference || r.request_reference || '') + '</small></div></div>' +
                    statusPill(r.status, pretty(r.status)) +
                '</div>';
            }).join('') + '</div>';
        }

        async function load() {
            wrap.setAttribute('aria-busy', 'true');
            try {
                var body = await req('/dashboard');
                var d = body.data || {};

                var set = function (id, value, note) {
                    var el = $(id);
                    if (!el) { return; }
                    el.textContent = value;
                    var n = el.parentElement.querySelector('.sp-kpi-note');
                    if (n && note != null) { n.textContent = note; }
                };

                set('#kpi-consult-total', d.consultations.total, (d.consultations.today || 0) + ' submitted today');
                set('#kpi-consult-pending', d.consultations.pending, 'awaiting confirmation');
                set('#kpi-consult-confirmed', d.consultations.confirmed, (d.consultations.completed || 0) + ' completed');
                set('#kpi-project-total', d.projects.total, (d.projects.today || 0) + ' submitted today');
                set('#kpi-project-review', d.projects.pending_review, 'awaiting review');
                set('#kpi-project-dev', d.projects.in_development, 'in development');
                set('#kpi-project-approved', d.projects.approved, 'approved, not yet started');

                var unread = $('#kpi-notif');
                if (unread) { unread.textContent = d.unread_notifications || 0; }

                renderTrend(d.trend);
                renderSessions('#sp-upcoming', d.upcoming_consultations, 'No upcoming consultations are booked.');
                renderSessions('#sp-today', d.today_sessions, 'No sessions scheduled for today.');
            } catch (e) {
                toast(e.message, 'error');
            } finally {
                wrap.removeAttribute('aria-busy');
            }
        }

        var refresh = $('#sp-refresh');
        if (refresh) { refresh.addEventListener('click', load); }
        load();
    }

    /* ======================================================================
       CONSULTATIONS + PROJECTS (shared list + drawer)
       ====================================================================== */
    function initQueue(kind) {
        var wrap = $(kind === 'consultation' ? '#sp-consultations' : '#sp-projects');
        if (!wrap) { return; }

        var state = { page: 1, limit: 25, meta: null };

        var $list = $('#sp-list');
        var $loading = $('#sp-loading');
        var $empty = $('#sp-empty');
        var $pagerInfo = $('#sp-pager-info');
        var $prev = $('#sp-prev');
        var $next = $('#sp-next');
        var $filters = $('#sp-filters');
        var $count = $('#sp-count');

        /* ---------- list ---------- */
        function buildQuery() {
            var q = new URLSearchParams();
            q.set('page', String(state.page));
            q.set('limit', String(state.limit));
            if ($filters) {
                new FormData($filters).forEach(function (v, k) { if (v) { q.set(k, v); } });
            }
            return q.toString();
        }

        async function load() {
            $loading.hidden = false;
            $empty.hidden = true;
            $list.innerHTML = '';
            try {
                var body = await req('/' + kind + 's?' + buildQuery());
                var rows = body.data || [];
                state.meta = body.meta || null;
                render(rows);
            } catch (e) {
                toast(e.message, 'error');
                $loading.hidden = true;
            }
        }

        function render(rows) {
            $loading.hidden = true;

            if (state.meta) {
                var m = state.meta;
                $count.textContent = (m.total || 0) + ' total';
                $pagerInfo.textContent = 'Page ' + (m.page || 1) + ' of ' + (m.pages || 1) + ' · showing ' + (m.count != null ? m.count : rows.length);
                $prev.disabled = (m.page || 1) <= 1;
                $next.disabled = (m.page || 1) >= (m.pages || 1);
            }

            if (!rows.length) {
                $empty.hidden = false;
                return;
            }

            var isConsult = kind === 'consultation';
            $list.innerHTML = rows.map(function (r) {
                var ref = isConsult ? r.booking_reference : r.request_reference;
                var when = isConsult
                    ? '<span class="sp-nowrap">' + esc(r.preferred_date) + ' · ' + esc(r.preferred_time) + '</span>'
                    : '<span class="sp-nowrap">' + esc(r.duration_label || pretty(r.project_duration)) + '</span>';

                var budget = isConsult
                    ? '<span class="sp-nowrap">—</span>'
                    : '<span class="sp-nowrap">' + esc(money(r.budget_max || r.budget_min, r.currency)) + '</span>';

                return '<tr data-row="' + esc(r.id) + '">' +
                    '<td><span class="sp-ref">' + esc(ref) + '</span><br><small style="color:var(--gis-muted);">' + esc(stamp(r.created_at)) + '</small></td>' +
                    '<td>' + esc(r.name) + '<br><small style="color:var(--gis-muted);">' + esc(r.email) + '</small></td>' +
                    '<td>' + esc(r.category_label) + '</td>' +
                    '<td>' + when + '</td>' +
                    '<td>' + budget + '</td>' +
                    '<td>' + statusPill(r.status, r.status_label) + '</td>' +
                    '<td><div class="sp-row-actions">' +
                        '<button data-open="' + esc(r.id) + '" class="ok"><i class="fal fa-eye"></i> Open</button>' +
                        (r.whatsapp_link ? '<a href="' + esc(r.whatsapp_link) + '" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i></a>' : '') +
                        (r.has_attachment ? '<a href="' + API + '/' + kind + 's/' + esc(r.id) + '/attachment" target="_blank" rel="noopener noreferrer" title="' + esc(r.attachment_name || 'Attachment') + '"><i class="fal fa-paperclip"></i></a>' : '') +
                    '</div></td>' +
                '</tr>';
            }).join('');
        }

        /* ---------- drawer ---------- */
        var $drawer = $('#sp-drawer');
        var $dTitle = $('#sp-drawer-title');
        var $dSub = $('#sp-drawer-sub');
        var $dBody = $('#sp-drawer-body');
        var $dFoot = $('#sp-drawer-foot');
        var current = null;

        function openDrawer() {
            $drawer.classList.add('is-open');
            $drawer.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            var close = $('#sp-drawer-close');
            if (close) { close.focus(); }
        }
        function closeDrawer() {
            $drawer.classList.remove('is-open');
            $drawer.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            current = null;
        }

        async function open(id) {
            $dBody.innerHTML = '<div class="admin-loading">Loading…</div>';
            $dFoot.innerHTML = '';
            openDrawer();
            try {
                var body = await req('/' + kind + 's/' + encodeURIComponent(id));
                current = body.data;
                paint(current);
            } catch (e) {
                toast(e.message, 'error');
                closeDrawer();
            }
        }

        function field(label, value, html) {
            return '<dt>' + esc(label) + '</dt><dd>' + (html ? value : esc(value == null || value === '' ? '—' : value)) + '</dd>';
        }

        function paint(row) {
            var isConsult = kind === 'consultation';
            $dTitle.textContent = isConsult ? row.booking_reference : row.request_reference;
            $dSub.textContent = row.name + ' · ' + row.category_label;

            var meetLink = isConsult ? row.google_meet_link : row.meeting_link;
            var detail =
                '<section><h3>Request</h3><dl class="sp-detail-list">' +
                    field('Name', row.name) +
                    field('Email', row.email, row.email ? '<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + '</a>' : '') +
                    field('WhatsApp', row.whatsapp_display || row.whatsapp, row.whatsapp_link ? '<a href="' + esc(row.whatsapp_link) + '" target="_blank" rel="noopener noreferrer">' + esc(row.whatsapp_display || row.whatsapp) + '</a>' : esc(row.whatsapp_display || row.whatsapp)) +
                    field('University', row.university) +
                    field('Degree', row.degree) +
                    field('Category', row.category_label) +
                    field('Summary', row.short_description) +
                    field('Submitted', stamp(row.created_at)) +
                '</dl></section>' +
                '<section><h3>Description</h3><p style="color:var(--gis-text);line-height:1.7;font-size:0.9rem;white-space:pre-wrap;margin:0;">' + esc(row.long_description) + '</p></section>';

            var controls;
            if (isConsult) {
                controls =
                    '<section><h3>Schedule</h3><div class="sp-form-grid">' +
                        '<div class="sp-field"><label for="sp-d-date">Date</label>' +
                            '<input type="date" id="sp-d-date" value="' + esc(row.preferred_date) + '"></div>' +
                        '<div class="sp-field"><label for="sp-d-time">Time</label>' +
                            '<input type="time" id="sp-d-time" value="' + esc(row.preferred_time) + '">' +
                            '<span class="hint">Rescheduling validates against live availability.</span></div>' +
                    '</div></section>' +
                    '<section><h3>Google Meet link</h3><div class="sp-field" id="sp-meet-field">' +
                        '<label for="sp-d-meet">Meeting URL</label>' +
                        '<input type="url" id="sp-d-meet" value="' + esc(meetLink || '') + '" placeholder="https://meet.google.com/abc-defg-hij">' +
                        '<span class="hint">Only meet.google.com and g.co links are accepted.</span>' +
                        '<span class="sp-field-msg"></span>' +
                    '</div></section>';
            } else {
                controls =
                    '<section><h3>Commercials</h3><div class="sp-form-grid">' +
                        '<div class="sp-field"><label for="sp-d-quote">Quoted amount (PKR)</label>' +
                            '<input type="number" id="sp-d-quote" min="0" step="100" value="' + esc(row.quoted_amount == null ? '' : row.quoted_amount) + '"></div>' +
                        '<div class="sp-field"><label for="sp-d-budget">Student budget range</label>' +
                            '<input type="text" id="sp-d-budget" value="' + esc(money(row.budget_min, row.currency) + (row.budget_max ? ' – ' + money(row.budget_max, row.currency) : '')) + '" disabled></div>' +
                        '<div class="sp-field"><label for="sp-d-duration">Duration</label>' +
                            '<input type="text" id="sp-d-duration" value="' + esc(row.duration_label) + '" disabled></div>' +
                    '</div></section>' +
                    '<section><h3>Assignment</h3><div class="sp-form-grid">' +
                        '<div class="sp-field"><label for="sp-d-consultant">Consultant</label>' +
                            '<input type="text" id="sp-d-consultant" value="' + esc(row.assigned_consultant || '') + '" placeholder="Name of the consultant"></div>' +
                        '<div class="sp-field"><label for="sp-d-team">Team</label>' +
                            '<input type="text" id="sp-d-team" value="' + esc(row.assigned_team || '') + '" placeholder="Team or squad"></div>' +
                        '<div class="sp-field wide"><label for="sp-d-meet">Meeting link</label>' +
                            '<input type="url" id="sp-d-meet" value="' + esc(meetLink || '') + '" placeholder="https://meet.google.com/abc-defg-hij">' +
                            '<span class="hint">Only meet.google.com and g.co links are accepted.</span>' +
                            '<span class="sp-field-msg"></span></div>' +
                    '</div></section>';
            }

            var activity = (row.activity || []).map(function (a) {
                return '<li>' + esc(a.description || pretty(a.action)) + '<time>' + esc(stamp(a.created_at)) + (a.performed_by ? ' · ' + esc(a.performed_by) : '') + '</time></li>';
            }).join('');

            $dBody.innerHTML =
                '<section><h3>Status</h3><div class="sp-form-grid"><div class="sp-field">' +
                    '<label for="sp-d-status">Current status</label>' +
                    statusSelect(kind, row.status) +
                '</div></div></section>' +
                controls +
                '<section><h3>Description</h3><dl class="sp-detail-list">' + detail + '</dl></section>' +
                '<section><h3>Internal notes</h3><div class="sp-field" id="sp-notes-field">' +
                    '<label for="sp-d-notes">Notes (never shown to the student)</label>' +
                    '<textarea id="sp-d-notes" rows="4">' + esc(row.admin_notes || '') + '</textarea>' +
                '</div></section>' +
                '<section><h3>Activity</h3>' +
                    (activity ? '<ul class="sp-timeline">' + activity + '</ul>' : '<p style="color:var(--gis-muted);font-size:0.86rem;margin:0;">No activity recorded yet.</p>') +
                '</section>';

            /* Drop the duplicated "Request"/"Description" block built above. */
            var dup = $dBody.querySelectorAll('section')[2];
            if (dup && /Description/.test(dup.querySelector('h3').textContent)) { dup.remove(); }

            $dFoot.innerHTML =
                '<button type="button" class="theme-btn" data-act="save-status">Save status</button>' +
                (isConsult
                    ? '<button type="button" class="admin-ghost-btn" data-act="save-meet">Save Meet link</button>' +
                      '<button type="button" class="admin-ghost-btn" data-act="save-schedule">Save schedule</button>'
                    : '<button type="button" class="admin-ghost-btn" data-act="save-quote">Save quote</button>' +
                      '<button type="button" class="admin-ghost-btn" data-act="save-assign">Save assignment</button>' +
                      '<button type="button" class="admin-ghost-btn" data-act="save-meeting">Save meeting link</button>') +
                '<button type="button" class="admin-ghost-btn" data-act="save-notes">Save notes</button>' +
                '<button type="button" class="admin-ghost-btn" data-act="archive">Archive</button>';
        }

        function clearErrors() {
            $$('.sp-field.err', $drawer).forEach(function (f) { f.classList.remove('err'); });
        }
        function showFieldErrors(errors) {
            clearErrors();
            var map = {
                google_meet_link: 'sp-meet-field',
                meeting_link: 'sp-meet-field'
            };
            Object.keys(errors || {}).forEach(function (field) {
                var wrap = $(map[field] ? '#' + map[field] : '#' + (field === 'admin_notes' ? 'sp-notes-field' : ''), $drawer);
                if (!wrap) { return; }
                wrap.classList.add('err');
                var msg = $('.sp-field-msg', wrap);
                if (msg) { msg.textContent = errors[field]; }
            });
            toast('Please correct the highlighted fields.', 'error');
        }

        async function act(action) {
            if (!current) { return; }
            var id = current.id;
            try {
                if (action === 'save-status') {
                    var status = $('[data-status-kind]', $drawer).value;
                    await req('/' + kind + 's/' + id + '/status', { method: 'PATCH', body: { status: status } });
                    toast('Status updated to ' + pretty(status) + '.');
                } else if (action === 'save-notes') {
                    await req('/' + kind + 's/' + id + '/notes', { method: 'POST', body: { admin_notes: $('#sp-d-notes').value } });
                    toast('Notes saved.');
                } else if (action === 'save-meet') {
                    await req('/' + kind + 's/' + id + '/meet-link', { method: 'POST', body: { google_meet_link: $('#sp-d-meet').value.trim() } });
                    toast('Google Meet link saved.');
                } else if (action === 'save-schedule') {
                    await req('/' + kind + 's/' + id, {
                        method: 'PATCH',
                        body: { preferred_date: $('#sp-d-date').value, preferred_time: $('#sp-d-time').value }
                    });
                    toast('Schedule updated.');
                } else if (action === 'save-quote') {
                    await req('/' + kind + 's/' + id + '/quote', { method: 'POST', body: { quoted_amount: $('#sp-d-quote').value } });
                    toast('Quotation saved.');
                } else if (action === 'save-assign') {
                    await req('/' + kind + 's/' + id + '/assign', {
                        method: 'POST',
                        body: { assigned_consultant: $('#sp-d-consultant').value, assigned_team: $('#sp-d-team').value }
                    });
                    toast('Assignment saved.');
                } else if (action === 'save-meeting') {
                    await req('/' + kind + 's/' + id + '/meeting', { method: 'POST', body: { meeting_link: $('#sp-d-meet').value.trim() } });
                    toast('Meeting link saved.');
                } else if (action === 'archive') {
                    if (!confirm('Archive this record? It stops occupying its slot but stays in the audit trail.')) { return; }
                    await req('/' + kind + 's/' + id, { method: 'DELETE' });
                    toast('Record archived.');
                    closeDrawer();
                }
                await open(id);
                await load();
            } catch (e) {
                if (e.errors) { showFieldErrors(e.errors); } else { toast(e.message, 'error'); }
            }
        }

        /* ---------- events ---------- */
        $list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-open]');
            if (btn) { open(btn.dataset.open); }
        });
        $drawer.addEventListener('click', function (e) {
            if (e.target.matches('[data-act]')) { act(e.target.dataset.act); }
        });
        $('#sp-drawer-close').addEventListener('click', closeDrawer);
        $('#sp-drawer-backdrop').addEventListener('click', closeDrawer);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && $drawer.classList.contains('is-open')) { closeDrawer(); }
        });

        $filters.addEventListener('submit', function (e) {
            e.preventDefault();
            state.page = 1;
            load();
        });
        $('#sp-clear').addEventListener('click', function () {
            $filters.reset();
            state.page = 1;
            load();
        });
        $prev.addEventListener('click', function () { if (!$prev.disabled) { state.page--; load(); } });
        $next.addEventListener('click', function () { if (!$next.disabled) { state.page++; load(); } });

        // Status vocabulary has to be loaded before the table can render pills.
        req('/settings').then(function (body) {
            var v = (body.data && body.data.vocabulary) || {};
            CONFIG.consultation_statuses = v.consultation_statuses || {};
            CONFIG.project_statuses = v.project_statuses || {};
            var sel = $('[name="status"]', $filters);
            if (sel) {
                var map = kind === 'project' ? CONFIG.project_statuses : CONFIG.consultation_statuses;
                sel.innerHTML = '<option value="">All statuses</option>' +
                    Object.keys(map).map(function (k) { return '<option value="' + esc(k) + '">' + esc(map[k]) + '</option>'; }).join('');
            }
        }).catch(function () { /* filters still work without the vocabulary */ });

        load();
    }

    /* ======================================================================
       SHOWCASE
       ====================================================================== */
    function initShowcase() {
        var wrap = $('#sp-showcase-admin');
        if (!wrap) { return; }

        var $list = $('#sp-showcase-list');
        var $form = $('#sp-showcase-form');
        var $title = $('#sp-showcase-form-title');
        var $loading = $('#sp-showcase-loading');
        var $empty = $('#sp-showcase-empty');

        var ICONS = {
            'mobile-apps': 'fa-mobile-alt', 'web-applications': 'fa-globe', 'ui-ux-design': 'fa-pen-nib',
            'ai-machine-learning': 'fa-brain', 'erp-crm': 'fa-cubes', 'ecommerce': 'fa-shopping-bag',
            'apis-backend': 'fa-code-branch', 'desktop-apps': 'fa-desktop', 'cloud-devops': 'fa-cloud',
            other: 'fa-diagram-project'
        };

        function render(rows) {
            $loading.hidden = true;
            if (!rows.length) {
                $empty.hidden = false;
                $list.innerHTML = '';
                return;
            }
            $empty.hidden = true;
            $list.innerHTML = '<div class="sp-showcase-list">' + rows.map(function (r) {
                var thumb = r.image_url
                    ? '<img src="' + esc(r.image_url) + '" alt="' + esc(r.image_alt || r.title) + '" loading="lazy">'
                    : '<i class="fal ' + esc(ICONS[r.category] || 'fa-diagram-project') + '" aria-hidden="true"></i>';
                return '<div class="sp-showcase-row" data-row="' + esc(r.id) + '">' +
                    '<div class="sp-showcase-thumb">' + thumb + '</div>' +
                    '<div>' +
                        '<div class="sp-showcase-title">' + esc(r.title) + '</div>' +
                        '<div class="sp-showcase-meta">' +
                            statusPill(r.status, r.status) +
                            '<span>' + esc(r.category_label) + '</span>' +
                            '<span>order ' + esc(r.sort_order) + '</span>' +
                            '<span>/' + esc(r.slug) + '</span>' +
                        '</div>' +
                        '<div class="sp-showcase-desc">' + esc(r.short_description) + '</div>' +
                    '</div>' +
                    '<div class="sp-row-actions">' +
                        '<button data-edit="' + esc(r.id) + '"><i class="fal fa-pen"></i> Edit</button>' +
                        (r.status === 'published'
                            ? '<button data-toggle="' + esc(r.id) + '" data-status="draft"><i class="fal fa-eye-slash"></i> Unpublish</button>'
                            : '<button data-toggle="' + esc(r.id) + '" data-status="published" class="ok"><i class="fal fa-eye"></i> Publish</button>') +
                        '<button class="danger" data-archive="' + esc(r.id) + '"><i class="fal fa-archive"></i> Archive</button>' +
                    '</div>' +
                '</div>';
            }).join('') + '</div>';
        }

        async function load() {
            $loading.hidden = false;
            $empty.hidden = true;
            try {
                var body = await req('/showcase');
                render(body.data || []);
            } catch (e) {
                $loading.hidden = true;
                toast(e.message, 'error');
            }
        }

        function fill(row) {
            $form.reset();
            $form.elements.id.value = row ? row.id : '';
            ['title', 'slug', 'category', 'short_description', 'full_description', 'technologies',
             'image_url', 'image_alt', 'external_url', 'sort_order', 'status'].forEach(function (k) {
                var el = $form.elements[k];
                if (el) { el.value = row && row[k] != null ? row[k] : (k === 'status' ? 'published' : k === 'sort_order' ? 0 : ''); }
            });
            $title.textContent = row ? 'Edit showcase item' : 'Add showcase item';
            $$('.sp-field.err', $form).forEach(function (f) { f.classList.remove('err'); });
            $$('.sp-field-msg', $form).forEach(function (m) { m.textContent = ''; });
            $('#sp-showcase-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        $('#sp-showcase-new').addEventListener('click', function () { fill(null); });

        $list.addEventListener('click', async function (e) {
            var edit = e.target.closest('[data-edit]');
            var toggle = e.target.closest('[data-toggle]');
            var archive = e.target.closest('[data-archive]');
            try {
                if (edit) {
                    var body = await req('/showcase/' + edit.dataset.edit);
                    fill(body.data);
                } else if (toggle) {
                    await req('/showcase/' + toggle.dataset.toggle, { method: 'PATCH', body: { status: toggle.dataset.status } });
                    toast('Showcase item updated.');
                    load();
                } else if (archive) {
                    if (!confirm('Archive this showcase item? It disappears from the public page.')) { return; }
                    await req('/showcase/' + archive.dataset.archive, { method: 'DELETE' });
                    toast('Showcase item archived.');
                    load();
                }
            } catch (x) { toast(x.message, 'error'); }
        });

        $form.addEventListener('submit', async function (e) {
            e.preventDefault();
            $$('.sp-field.err', $form).forEach(function (f) { f.classList.remove('err'); });
            $$('.sp-field-msg', $form).forEach(function (m) { m.textContent = ''; });

            var data = {};
            new FormData($form).forEach(function (v, k) { data[k] = v; });
            var id = data.id;
            delete data.id;
            if (!data.slug) { delete data.slug; }

            try {
                await req('/showcase' + (id ? '/' + id : ''), {
                    method: id ? 'PATCH' : 'POST',
                    body: data
                });
                toast('Showcase item saved.');
                fill(null);
                load();
            } catch (x) {
                toast(x.message, 'error');
                if (x.errors) {
                    Object.keys(x.errors).forEach(function (field) {
                        var wrap = $('[data-field="' + field + '"]', $form);
                        if (!wrap) { return; }
                        wrap.classList.add('err');
                        var msg = $('.sp-field-msg', wrap);
                        if (msg) { msg.textContent = x.errors[field]; }
                    });
                }
            }
        });

        load();
    }

    /* ======================================================================
       SETTINGS + NOTIFICATIONS
       ====================================================================== */
    function initSettings() {
        var wrap = $('#sp-settings-page');
        if (!wrap) { return; }

        var $form = $('#sp-settings-form');
        var $vocab = $('#sp-vocabulary');
        var $notif = $('#sp-notifications');

        async function loadNotifications() {
            if (!$notif) { return; }
            try {
                var body = await req('/notifications?limit=30');
                var rows = body.data || [];
                var unread = (body.meta && body.meta.unread) || 0;
                var badge = $('#sp-notif-count');
                if (badge) { badge.textContent = unread; }
                if (!rows.length) {
                    $notif.innerHTML = '<p class="admin-empty" style="padding:22px;margin:0;">No notifications yet.</p>';
                    return;
                }
                $notif.innerHTML = '<div class="sp-notif-list">' + rows.map(function (n) {
                    return '<div class="sp-notif' + (n.is_read ? '' : ' unread') + '">' +
                        '<i class="fal fa-bell" aria-hidden="true"></i>' +
                        '<div><strong>' + esc(n.title) + '</strong>' +
                        '<p>' + esc(n.body) + '</p>' +
                        '<time>' + esc(stamp(n.created_at)) + (n.reference ? ' · ' + esc(n.reference) : '') + '</time></div>' +
                    '</div>';
                }).join('') + '</div>';
            } catch (e) { /* a missing notification feed must not break settings */ }
        }

        req('/settings').then(function (body) {
            var d = body.data || {};
            var s = d.settings || {};
            Object.keys(s).forEach(function (k) {
                var el = $form.elements[k];
                if (el) { el.value = s[k]; }
            });
            var limits = d.limits || {};
            var info = $('#sp-limits');
            if (info) {
                info.textContent = 'Max upload ' + Math.round((limits.max_file_size || 0) / (1024 * 1024)) + ' MB · ' +
                    'accepted: ' + (limits.allowed_extensions || []).join(', ') + ' · ' +
                    'rate limit ' + limits.rate_limit + ' submissions per ' + Math.round((limits.rate_window || 0) / 3600) + ' hour(s).';
            }

            if ($vocab) {
                var groups = [
                    ['Consultation statuses', d.vocabulary.consultation_statuses, 'Blocking statuses occupy the slot: pending, confirmed, rescheduled.'],
                    ['Project statuses', d.vocabulary.project_statuses, 'New requests always start at Pending Review.'],
                    ['Consultation categories', d.vocabulary.consultation_categories, null],
                    ['Project categories', d.vocabulary.project_categories, null],
                    ['Durations', d.vocabulary.durations, null],
                    ['Showcase categories', d.vocabulary.showcase_categories, null]
                ];
                $vocab.innerHTML = groups.filter(function (g) { return g[1]; }).map(function (g) {
                    return '<section class="admin-panel" style="margin-bottom:16px;">' +
                        '<div class="admin-panel-heading" style="margin-bottom:14px;"><div>' +
                            '<span class="admin-kicker">Vocabulary</span><h2 style="font-size:18px;">' + esc(g[0]) + '</h2>' +
                        '</div></div>' +
                        (g[2] ? '<p style="color:var(--gis-muted);font-size:0.84rem;margin:0 0 12px;">' + esc(g[2]) + '</p>' : '') +
                        '<div style="display:flex;flex-wrap:wrap;gap:7px;">' +
                            Object.keys(g[1]).map(function (k) {
                                return '<span class="admin-status-pill sp-draft">' + esc(g[1][k]) + '</span>';
                            }).join('') +
                        '</div></section>';
                }).join('');
            }
        }).catch(function (e) { toast(e.message, 'error'); });

        $form.addEventListener('submit', async function (e) {
            e.preventDefault();
            $$('.sp-field.err', $form).forEach(function (f) { f.classList.remove('err'); });
            $$('.sp-field-msg', $form).forEach(function (m) { m.textContent = ''; });

            var data = {};
            new FormData($form).forEach(function (v, k) { data[k] = v; });
            try {
                await req('/settings', { method: 'PATCH', body: data });
                toast('Settings saved. New slots use these rules immediately.');
            } catch (x) {
                toast(x.message, 'error');
                if (x.errors) {
                    Object.keys(x.errors).forEach(function (field) {
                        var wrap = $('[data-field="' + field + '"]', $form);
                        if (!wrap) { return; }
                        wrap.classList.add('err');
                        var msg = $('.sp-field-msg', wrap);
                        if (msg) { msg.textContent = x.errors[field]; }
                    });
                }
            }
        });

        var readAll = $('#sp-notif-read');
        if (readAll) {
            readAll.addEventListener('click', async function () {
                try {
                    await req('/notifications', { method: 'POST' });
                    toast('All notifications marked read.');
                    loadNotifications();
                } catch (e) { toast(e.message, 'error'); }
            });
        }
        var clearAll = $('#sp-notif-clear');
        if (clearAll) {
            clearAll.addEventListener('click', async function () {
                if (!confirm('Delete every notification? This cannot be undone.')) { return; }
                try {
                    await req('/notifications', { method: 'DELETE' });
                    toast('Notifications cleared.');
                    loadNotifications();
                } catch (e) { toast(e.message, 'error'); }
            });
        }
        var refreshNotif = $('#sp-notif-refresh');
        if (refreshNotif) { refreshNotif.addEventListener('click', loadNotifications); }

        loadNotifications();
    }

    /* ======================================================================
       Boot
       ====================================================================== */
    initOverview();
    initQueue('consultation');
    initQueue('project');
    initShowcase();
    initSettings();
})();
