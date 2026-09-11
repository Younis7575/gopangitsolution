/* ==========================================================================
   Gopang IT Solution — Company Facts (Single Source of Truth)
   --------------------------------------------------------------------------
   Every statistic shown on the website must come from, or match, this file.
   - Update a value here when reality changes.
   - Any [data-stat="key"] element on any page is filled automatically.
   - Do NOT display a number anywhere that is not defined below.
   Rule: if we cannot verify it, we do not publish it.
   ========================================================================== */
(function (window, document) {
  'use strict';

  var COMPANY_STATS = {
    projectsDelivered: { value: 150, suffix: '+', label: 'Projects Delivered' },
    teamMembers:       { value: 30,  suffix: '+', label: 'Team Members' },
    industriesServed:  { value: 9,   suffix: '+', label: 'Industries Served' },
    coreServices:      { value: 11,  suffix: '',  label: 'Core Services' }
    // NOTE: intentionally NOT published (unverifiable): client satisfaction %,
    // awards, exact client counts, "years of experience", revenue metrics.
  };

  function fill(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-stat]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-stat');
      var stat = COMPANY_STATS[key];
      if (stat) {
        nodes[i].textContent = stat.value + stat.suffix;
      }
    }
  }

  window.GOPANG_COMPANY_STATS = COMPANY_STATS;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { fill(); });
  } else {
    fill();
  }
})(window, document);
