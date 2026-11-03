/* TF-GUI-014 — one capability-filtered navigation projection.
 * Presentation only: this file NEVER authorizes business data, routes or commands.
 * Caller MUST use server-verified actor/business/assignment grants; the host and
 * command backend independently enforce permissions on every read/write.
 * No new role store, company membership, action executor or route is created.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TradeFlowAdaptiveNavigation = api;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';

  const ROUTES = Object.freeze({
    dashboard: { label: 'Home', group: 'Overview' },
    map: { label: 'Map', group: 'Operations' },
    calendar: { label: 'Calendar', group: 'Operations' },
    expenses: { label: 'Finance', group: 'Finance' },
    settings: { label: 'More', group: 'Administration' },
    jobs: { label: 'Jobs', group: 'Work' },
    tasks: { label: 'Tasks', group: 'Work' },
    dispatch: { label: 'Crew & Dispatch', group: 'Operations' },
    customers: { label: 'Customers', group: 'Work' },
    quotes: { label: 'Quotations', group: 'Work' },
    opportunities: { label: 'Opportunities', group: 'Work' },
    invoices: { label: 'Invoices', group: 'Finance' },
    profitability: { label: 'Job Costing', group: 'Finance' },
    suppliers: { label: 'Suppliers', group: 'Operations' },
    routes: { label: 'Route Planner', group: 'Operations' },
    library: { label: 'Library', group: 'Administration' },
    integrations: { label: 'Integrations', group: 'Administration' },
    growth: { label: 'Growth Intelligence', group: 'Intelligence' },
    missions: { label: 'Business Missions', group: 'Intelligence' },
    marketing: { label: 'Marketing Studio', group: 'Intelligence' },
    research: { label: 'Research Briefs', group: 'Intelligence' },
    ai: { label: 'TradeFlow AI', group: 'Intelligence' }
  });
  const LEGACY_MOBILE = Object.freeze(['dashboard', 'map', 'calendar', 'expenses', 'settings']);
  const PROFILE_PRIORITY = Object.freeze({
    owner: ['dashboard', 'map', 'calendar', 'expenses', 'settings', 'jobs', 'invoices', 'quotes'],
    office: ['dashboard', 'jobs', 'calendar', 'invoices', 'settings', 'customers', 'quotes', 'tasks'],
    coordinator: ['dashboard', 'dispatch', 'calendar', 'jobs', 'settings', 'routes', 'map'],
    project_manager: ['dashboard', 'jobs', 'calendar', 'dispatch', 'settings', 'profitability'],
    foreman: ['dashboard', 'jobs', 'tasks', 'calendar', 'settings', 'dispatch'],
    technician: ['dashboard', 'jobs', 'tasks', 'calendar', 'settings']
  });
  const GROUP_ORDER = Object.freeze(['Overview', 'Work', 'Operations', 'Finance', 'Intelligence', 'Administration']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const uniqueKnown = values => [...new Set(values.filter(value => typeof value === 'string' && own(ROUTES, value)))];
  const frozenItem = key => Object.freeze({ route: key, label: ROUTES[key].label, group: ROUTES[key].group });
  const freezeItems = keys => Object.freeze(keys.map(frozenItem));

  /**
   * @param {object} options
   * @param {'local_legacy'|'verified'} options.scopeStatus
   * @param {string[]} [options.permittedRoutes] - already verified by the HOST, not this module
   * @param {string} [options.profile] - display priority only, NOT an authorization role
   * @param {string[]} [options.preferredRoutes] - optional reorder within already allowed routes
   * @param {string} [options.selectedRoute] - actual route, may be secondary or denied
   * @returns {Readonly<object>} read-only navigation model, not an access token
   */
  function projectNavigation(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Navigation options object required');
    }
    const { scopeStatus, profile, permittedRoutes, preferredRoutes, selectedRoute } = options;
    const legacy = scopeStatus === 'local_legacy';
    const verified = scopeStatus === 'verified';
    // Never infer access from a profile name, company preference, or crew display role.
    if (!legacy && (!verified || !Array.isArray(permittedRoutes))) {
      return Object.freeze({ status: 'scope_unavailable', profile: null,
        mobile: Object.freeze([]), secondary: Object.freeze([]), desktop: Object.freeze([]),
        selectedAllowed: false, selectedPrimary: false });
    }
    const allowedKeys = legacy ? Object.keys(ROUTES) : uniqueKnown(permittedRoutes);
    const allowed = new Set(allowedKeys);
    const safeProfile = own(PROFILE_PRIORITY, profile) ? profile : 'technician';
    const priorities = legacy ? LEGACY_MOBILE : PROFILE_PRIORITY[safeProfile];
    const favorites = Array.isArray(preferredRoutes) ? uniqueKnown(preferredRoutes) : [];
    const candidates = legacy ? LEGACY_MOBILE : uniqueKnown([...favorites, ...priorities, ...allowedKeys]);
    const mobileKeys = candidates.filter(key => allowed.has(key)).slice(0, 5);
    const mobile = freezeItems(mobileKeys);
    const secondary = freezeItems(allowedKeys.filter(key => !mobileKeys.includes(key)));
    const desktop = Object.freeze(GROUP_ORDER.map(group => Object.freeze({
      group,
      items: freezeItems(allowedKeys.filter(key => ROUTES[key].group === group))
    })).filter(group => group.items.length));
    const selectedAllowed = typeof selectedRoute === 'string' && allowed.has(selectedRoute);
    return Object.freeze({ status: legacy ? 'local_legacy' : 'projected',
      profile: legacy ? 'local_legacy' : safeProfile,
      mobile, secondary, desktop, selectedAllowed,
      selectedPrimary: selectedAllowed && mobileKeys.includes(selectedRoute) });
  }
  return Object.freeze({ version: 1, projectNavigation, legacyMobileRoutes: LEGACY_MOBILE });
});
