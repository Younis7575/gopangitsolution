/**
 * Gopang IT Solution — lightweight, privacy-respecting visitor tracker.
 *
 * Loads on every public page and quietly reports pageviews + session activity
 * to POST /api/track. It is fully self-contained, non-blocking, and wrapped so
 * that a tracking failure can never affect the page the visitor is viewing.
 *
 * The admin analytics dashboard (admin-only) reads this data back.
 */
(function () {
	"use strict";

	try {
		/* Never track the admin panel itself. */
		if (/\/admin[-/]/i.test(location.pathname)) {
			return;
		}

		var ENDPOINT =
			(window.JOB_API_BASE_URL || (window.localStorage && localStorage.getItem("JOB_API_BASE_URL")) || "") +
			"/api/track";

		var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity ends a session
		var HEARTBEAT_MS = 15000;

		/* --- Stable visitor id (persists across sessions) --- */
		function uuid() {
			if (window.crypto && crypto.randomUUID) {
				try { return crypto.randomUUID(); } catch (e) {}
			}
			return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
				var r = (Math.random() * 16) | 0;
				var v = c === "x" ? r : (r & 0x3) | 0x8;
				return v.toString(16);
			});
		}

		function store() {
			try { return window.localStorage; } catch (e) { return null; }
		}

		var ls = store();
		var visitorId = "";
		var sessionId = "";

		if (ls) {
			visitorId = ls.getItem("ga_vid") || "";
			if (!visitorId) {
				visitorId = uuid();
				ls.setItem("ga_vid", visitorId);
			}
			var sid = ls.getItem("ga_sid");
			var last = parseInt(ls.getItem("ga_sid_ts") || "0", 10);
			if (!sid || !last || Date.now() - last > SESSION_TIMEOUT) {
				sid = uuid();
			}
			sessionId = sid;
			ls.setItem("ga_sid", sessionId);
			ls.setItem("ga_sid_ts", String(Date.now()));
		} else {
			/* No storage (private mode) — fall back to per-load ids. */
			visitorId = uuid();
			sessionId = uuid();
		}

		/* Mirror ids into cookies so the server can link an application
		   submission back to this visitor (conversion tracking). */
		function setCookie(name, value, maxAgeSec) {
			try {
				document.cookie = name + "=" + encodeURIComponent(value) +
					"; path=/; max-age=" + maxAgeSec + "; SameSite=Lax";
			} catch (e) {}
		}

		function touchSession() {
			try { if (ls) ls.setItem("ga_sid_ts", String(Date.now())); } catch (e) {}
			setCookie("ga_sid", sessionId, Math.round(SESSION_TIMEOUT / 1000));
		}

		setCookie("ga_vid", visitorId, 60 * 60 * 24 * 365);
		setCookie("ga_sid", sessionId, Math.round(SESSION_TIMEOUT / 1000));

		var pageStart = Date.now();

		function payload(type) {
			return {
				t: type,
				vid: visitorId,
				sid: sessionId,
				url: location.pathname + location.search,
				title: document.title || "",
				ref: document.referrer || "",
				screen: (window.screen ? screen.width + "x" + screen.height : ""),
				dur: Math.round((Date.now() - pageStart) / 1000)
			};
		}

		function send(type, useBeacon) {
			try {
				var body = JSON.stringify(payload(type));
				if (useBeacon && navigator.sendBeacon) {
					var blob = new Blob([body], { type: "application/json" });
					navigator.sendBeacon(ENDPOINT, blob);
					return;
				}
				fetch(ENDPOINT, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: body,
					keepalive: true,
					credentials: "omit"
				}).catch(function () {});
			} catch (e) {}
		}

		/* Initial pageview */
		send("pageview", false);

		/* Heartbeat while the tab is visible (keeps "live visitors" + duration fresh). */
		var beat = window.setInterval(function () {
			if (document.visibilityState === "visible") {
				touchSession();
				send("heartbeat", false);
			}
		}, HEARTBEAT_MS);

		/* Report exit (best-effort) when the page is hidden or unloaded. */
		var exited = false;
		function reportExit() {
			if (exited) return;
			exited = true;
			touchSession();
			send("exit", true);
			try { window.clearInterval(beat); } catch (e) {}
		}

		document.addEventListener("visibilitychange", function () {
			if (document.visibilityState === "hidden") {
				exited = false; // allow a fresh exit ping each time the tab is hidden
				send("exit", true);
			}
		});
		window.addEventListener("pagehide", reportExit);
		window.addEventListener("beforeunload", reportExit);
	} catch (e) {
		/* Tracking must never break the page. */
	}
})();
