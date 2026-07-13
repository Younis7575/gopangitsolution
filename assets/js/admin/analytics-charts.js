/**
 * AnalyticsCharts — tiny, dependency-free canvas charting for the admin
 * analytics dashboard. Supports line (area), vertical bar, horizontal bar and
 * doughnut charts with hover tooltips, hi-DPI rendering and responsive resize.
 *
 * Usage: AnalyticsCharts.render(canvasEl, { type, data:[{label,value}], ... })
 * Charts auto-redraw on window resize and when their tab becomes visible.
 */
(function (global) {
	"use strict";

	var PALETTE = [
		"#0f62fe", "#12b76a", "#7c3aed", "#f79009", "#f04438", "#0891b2",
		"#ec4899", "#65a30d", "#e11d48", "#2563eb", "#059669", "#d97706"
	];

	var registry = []; // {canvas, cfg} — for responsive redraw

	function dpi(canvas) {
		var ratio = global.devicePixelRatio || 1;
		var rect = canvas.getBoundingClientRect();
		var w = Math.max(1, Math.floor(rect.width));
		var h = Math.max(1, Math.floor(rect.height || 260));
		canvas.width = w * ratio;
		canvas.height = h * ratio;
		var ctx = canvas.getContext("2d");
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		return { ctx: ctx, w: w, h: h };
	}

	function niceMax(v) {
		if (v <= 5) return 5;
		var pow = Math.pow(10, Math.floor(Math.log10(v)));
		var n = v / pow;
		var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
		return step * pow;
	}

	function fmt(n) {
		n = Number(n) || 0;
		if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
		if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
		return String(n);
	}

	function tooltip() {
		var el = document.getElementById("ac-tooltip");
		if (!el) {
			el = document.createElement("div");
			el.id = "ac-tooltip";
			el.className = "ac-tooltip";
			el.style.display = "none";
			document.body.appendChild(el);
		}
		return el;
	}

	function showTip(x, y, html) {
		var t = tooltip();
		t.innerHTML = html;
		t.style.display = "block";
		t.style.left = (x + 14) + "px";
		t.style.top = (y + 14) + "px";
	}
	function hideTip() {
		var t = document.getElementById("ac-tooltip");
		if (t) t.style.display = "none";
	}

	/* ---- Line / area chart ---- */
	function drawLine(canvas, cfg) {
		var d = dpi(canvas), ctx = d.ctx, W = d.w, H = d.h;
		if (W <= 20 || H <= 20) return; // canvas hidden / not laid out yet
		var data = cfg.data || [];
		ctx.clearRect(0, 0, W, H);
		if (!data.length) return emptyState(ctx, W, H);

		var padL = 44, padR = 14, padT = 16, padB = 30;
		var plotW = W - padL - padR, plotH = H - padT - padB;
		var max = niceMax(Math.max.apply(null, data.map(function (p) { return p.value; }).concat([1])));
		var color = cfg.color || PALETTE[0];

		/* grid + y labels */
		ctx.font = "11px Inter, sans-serif";
		ctx.textBaseline = "middle";
		for (var i = 0; i <= 4; i++) {
			var yy = padT + (plotH / 4) * i;
			var val = Math.round(max - (max / 4) * i);
			ctx.strokeStyle = "#eef1f6"; ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
			ctx.fillStyle = "#98a2b3"; ctx.textAlign = "right";
			ctx.fillText(fmt(val), padL - 8, yy);
		}

		var stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
		function px(i) { return padL + stepX * i; }
		function py(v) { return padT + plotH - (v / max) * plotH; }

		/* area fill */
		var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
		grad.addColorStop(0, hexA(color, 0.28));
		grad.addColorStop(1, hexA(color, 0.02));
		ctx.beginPath();
		ctx.moveTo(px(0), py(data[0].value));
		data.forEach(function (p, i) { ctx.lineTo(px(i), py(p.value)); });
		ctx.lineTo(px(data.length - 1), padT + plotH);
		ctx.lineTo(px(0), padT + plotH);
		ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

		/* line */
		ctx.beginPath();
		data.forEach(function (p, i) { i ? ctx.lineTo(px(i), py(p.value)) : ctx.moveTo(px(i), py(p.value)); });
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();

		/* x labels (sampled) */
		ctx.fillStyle = "#98a2b3"; ctx.textAlign = "center"; ctx.textBaseline = "top";
		var every = Math.ceil(data.length / 8);
		data.forEach(function (p, i) {
			if (i % every === 0 || i === data.length - 1) {
				ctx.fillText(shortLabel(p.label), px(i), padT + plotH + 8);
			}
		});

		/* points */
		data.forEach(function (p, i) {
			ctx.beginPath(); ctx.arc(px(i), py(p.value), 3, 0, Math.PI * 2);
			ctx.fillStyle = "#fff"; ctx.fill();
			ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
		});

		hookHover(canvas, function (mx, my, rect) {
			var idx = Math.round((mx - padL) / (stepX || 1));
			if (idx < 0 || idx >= data.length) return hideTip();
			var p = data[idx];
			showTip(rect.left + px(idx), rect.top + py(p.value),
				"<strong>" + esc(p.label) + "</strong><br>" + fmt(p.value) + " visitors");
		});
	}

	/* ---- Vertical bar chart ---- */
	function drawBar(canvas, cfg) {
		var d = dpi(canvas), ctx = d.ctx, W = d.w, H = d.h;
		if (W <= 20 || H <= 20) return; // canvas hidden / not laid out yet
		var data = cfg.data || [];
		ctx.clearRect(0, 0, W, H);
		if (!data.length) return emptyState(ctx, W, H);

		var padL = 44, padR = 14, padT = 16, padB = 40;
		var plotW = W - padL - padR, plotH = H - padT - padB;
		var max = niceMax(Math.max.apply(null, data.map(function (p) { return p.value; }).concat([1])));
		var color = cfg.color || PALETTE[0];

		ctx.font = "11px Inter, sans-serif"; ctx.textBaseline = "middle";
		for (var i = 0; i <= 4; i++) {
			var yy = padT + (plotH / 4) * i;
			ctx.strokeStyle = "#eef1f6"; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
			ctx.fillStyle = "#98a2b3"; ctx.textAlign = "right";
			ctx.fillText(fmt(Math.round(max - (max / 4) * i)), padL - 8, yy);
		}

		var slot = plotW / data.length;
		var bw = Math.min(38, slot * 0.62);
		var rects = [];
		data.forEach(function (p, i) {
			var h = (p.value / max) * plotH;
			var x = padL + slot * i + (slot - bw) / 2;
			var y = padT + plotH - h;
			rects.push({ x: x, y: y, w: bw, h: h, p: p });
			roundRect(ctx, x, y, bw, h, 5); ctx.fillStyle = cfg.multi ? PALETTE[i % PALETTE.length] : color; ctx.fill();
			ctx.fillStyle = "#98a2b3"; ctx.textAlign = "center"; ctx.textBaseline = "top";
			ctx.save(); ctx.font = "10px Inter, sans-serif";
			ctx.fillText(shortLabel(p.label), padL + slot * i + slot / 2, padT + plotH + 8);
			ctx.restore();
		});

		hookHover(canvas, function (mx, my, rect) {
			for (var i = 0; i < rects.length; i++) {
				var r = rects[i];
				if (mx >= r.x - 3 && mx <= r.x + r.w + 3 && my >= padT && my <= padT + plotH) {
					return showTip(rect.left + r.x + r.w / 2, rect.top + r.y,
						"<strong>" + esc(r.p.label) + "</strong><br>" + fmt(r.p.value));
				}
			}
			hideTip();
		});
	}

	/* ---- Horizontal bar chart (rankings) ---- */
	function drawHBar(canvas, cfg) {
		var d = dpi(canvas), ctx = d.ctx, W = d.w, H = d.h;
		if (W <= 20 || H <= 20) return; // canvas hidden / not laid out yet
		var data = (cfg.data || []).slice(0, cfg.limit || 10);
		ctx.clearRect(0, 0, W, H);
		if (!data.length) return emptyState(ctx, W, H);

		var padL = 8, padR = 46, padT = 6, padB = 6;
		var labelW = Math.min(160, Math.max.apply(null, data.map(function (p) {
			ctx.font = "12px Inter, sans-serif"; return ctx.measureText(shortLabel(p.label, 22)).width;
		})) + 12);
		var plotL = padL + labelW;
		var plotW = W - plotL - padR;
		var max = Math.max.apply(null, data.map(function (p) { return p.value; }).concat([1]));
		var rowH = (H - padT - padB) / data.length;
		var bh = Math.min(20, rowH * 0.55);
		var rects = [];

		data.forEach(function (p, i) {
			var cy = padT + rowH * i + rowH / 2;
			ctx.font = "12px Inter, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
			ctx.fillStyle = "#344054";
			ctx.fillText(shortLabel(p.label, 22), padL, cy);
			var w = Math.max(2, (p.value / max) * plotW);
			roundRect(ctx, plotL, cy - bh / 2, w, bh, 4);
			ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill();
			ctx.fillStyle = "#101828"; ctx.textAlign = "left";
			ctx.font = "700 12px Inter, sans-serif";
			ctx.fillText(fmt(p.value), plotL + w + 6, cy);
			rects.push({ x: plotL, y: cy - bh / 2, w: plotW, h: bh, p: p });
		});

		hookHover(canvas, function (mx, my, rect) {
			for (var i = 0; i < rects.length; i++) {
				var r = rects[i];
				if (my >= r.y - 4 && my <= r.y + r.h + 4) {
					return showTip(rect.left + mx, rect.top + r.y,
						"<strong>" + esc(r.p.label) + "</strong><br>" + fmt(r.p.value));
				}
			}
			hideTip();
		});
	}

	/* ---- Doughnut chart ---- */
	function drawDoughnut(canvas, cfg) {
		var d = dpi(canvas), ctx = d.ctx, W = d.w, H = d.h;
		if (W <= 20 || H <= 20) return; // canvas hidden / not laid out yet
		var data = (cfg.data || []).filter(function (p) { return p.value > 0; });
		ctx.clearRect(0, 0, W, H);
		if (!data.length) return emptyState(ctx, W, H);

		var total = data.reduce(function (s, p) { return s + Number(p.value); }, 0) || 1;
		var cx = H / 2 + 6, cy = H / 2, rOuter = Math.min(cx, cy) - 10, rInner = rOuter * 0.62;
		var start = -Math.PI / 2;
		var segs = [];
		data.forEach(function (p, i) {
			var ang = (p.value / total) * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo(cx, cy);
			ctx.arc(cx, cy, rOuter, start, start + ang);
			ctx.closePath();
			ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill();
			segs.push({ start: start, end: start + ang, p: p });
			start += ang;
		});
		/* punch the hole */
		ctx.globalCompositeOperation = "destination-out";
		ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2); ctx.fill();
		ctx.globalCompositeOperation = "source-over";

		/* center total */
		ctx.fillStyle = "#101828"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
		ctx.font = "800 20px Inter, sans-serif"; ctx.fillText(fmt(total), cx, cy - 6);
		ctx.fillStyle = "#98a2b3"; ctx.font = "11px Inter, sans-serif"; ctx.fillText("Total", cx, cy + 12);

		/* legend on the right */
		var lx = cx + rOuter + 22, ly = 14;
		ctx.textAlign = "left"; ctx.textBaseline = "middle";
		data.slice(0, 8).forEach(function (p, i) {
			ctx.fillStyle = PALETTE[i % PALETTE.length];
			roundRect(ctx, lx, ly - 5, 11, 11, 3); ctx.fill();
			ctx.fillStyle = "#344054"; ctx.font = "12px Inter, sans-serif";
			var pct = Math.round((p.value / total) * 100);
			ctx.fillText(shortLabel(p.label, 16) + "  " + pct + "%", lx + 18, ly);
			ly += 22;
		});

		hookHover(canvas, function (mx, my, rect) {
			var dx = mx - cx, dy = my - cy, dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < rInner || dist > rOuter) return hideTip();
			var ang = Math.atan2(dy, dx);
			if (ang < -Math.PI / 2) ang += Math.PI * 2;
			for (var i = 0; i < segs.length; i++) {
				if (ang >= segs[i].start && ang <= segs[i].end) {
					var pct = Math.round((segs[i].p.value / total) * 100);
					return showTip(rect.left + mx, rect.top + my,
						"<strong>" + esc(segs[i].p.label) + "</strong><br>" + fmt(segs[i].p.value) + " (" + pct + "%)");
				}
			}
			hideTip();
		});
	}

	/* ---- helpers ---- */
	function roundRect(ctx, x, y, w, h, r) {
		if (h < 0) { y += h; h = -h; }
		if (w <= 0 || h <= 0) { ctx.beginPath(); return; } // nothing to draw (hidden canvas)
		r = Math.max(0, Math.min(r, w / 2, h / 2));
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}
	function hexA(hex, a) {
		hex = hex.replace("#", "");
		var n = parseInt(hex, 16);
		return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
	}
	function shortLabel(s, max) {
		s = String(s == null ? "" : s);
		max = max || 10;
		return s.length > max ? s.slice(0, max - 1) + "…" : s;
	}
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}
	function emptyState(ctx, W, H) {
		ctx.fillStyle = "#98a2b3"; ctx.font = "13px Inter, sans-serif";
		ctx.textAlign = "center"; ctx.textBaseline = "middle";
		ctx.fillText("No data for this range", W / 2, H / 2);
	}
	function hookHover(canvas, handler) {
		canvas.__acHover = handler;
		if (canvas.__acBound) return;
		canvas.__acBound = true;
		canvas.addEventListener("mousemove", function (e) {
			var rect = canvas.getBoundingClientRect();
			if (canvas.__acHover) canvas.__acHover(e.clientX - rect.left, e.clientY - rect.top, rect);
		});
		canvas.addEventListener("mouseleave", hideTip);
	}

	function renderOne(canvas, cfg) {
		if (!canvas) return;
		switch (cfg.type) {
			case "line": drawLine(canvas, cfg); break;
			case "bar": drawBar(canvas, cfg); break;
			case "hbar": drawHBar(canvas, cfg); break;
			case "doughnut": drawDoughnut(canvas, cfg); break;
		}
	}

	var AnalyticsCharts = {
		render: function (canvas, cfg) {
			if (!canvas) return;
			var existing = registry.filter(function (r) { return r.canvas === canvas; })[0];
			if (existing) { existing.cfg = cfg; } else { registry.push({ canvas: canvas, cfg: cfg }); }
			renderOne(canvas, cfg);
		},
		/* Re-draw every registered chart (e.g. after resize or tab switch). */
		redrawAll: function () {
			registry.forEach(function (r) {
				if (r.canvas.offsetParent !== null) renderOne(r.canvas, r.cfg);
			});
		},
		clear: function () { registry = []; }
	};

	var resizeTimer = null;
	global.addEventListener("resize", function () {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(function () { AnalyticsCharts.redrawAll(); }, 150);
	});

	global.AnalyticsCharts = AnalyticsCharts;
})(window);
