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
  const validProjections = new WeakSet();
  const markProjection = projection => { const frozen = Object.freeze(projection); validProjections.add(frozen); return frozen; };
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
      return markProjection({ status: 'scope_unavailable', profile: null,
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
    return markProjection({ status: legacy ? 'local_legacy' : 'projected',
      profile: legacy ? 'local_legacy' : safeProfile,
      mobile, secondary, desktop, selectedAllowed,
      selectedPrimary: selectedAllowed && mobileKeys.includes(selectedRoute) });
  }
  // Presentation-only route decision. Host must independently check authenticated
  // scope on navigation and never treat this as an action authorization result.
  function resolveRouteIntent({ navigation, route, cause = 'user_request' } = {}) {
    if (!['user_request', 'current_route_revoked'].includes(cause)) {
      throw new TypeError('Unknown navigation intent cause');
    }
    const result = (disposition, destination = null, reason = null) =>
      Object.freeze({ disposition, destination, reason, authorization: 'not_evaluated' });
    if (!navigation || !validProjections.has(navigation) ||
        !['local_legacy', 'projected'].includes(navigation.status) ||
        !Array.isArray(navigation.mobile) || !Array.isArray(navigation.secondary)) {
      return result('blocked', null, 'scope_unavailable');
    }
    const permitted = [...navigation.mobile, ...navigation.secondary]
      .map(item => item?.route)
      .filter(item => typeof item === 'string' && own(ROUTES, item));
    const allowed = new Set(permitted);
    if (typeof route === 'string' && allowed.has(route)) {
      return result('allowed', route, null);
    }
    if (cause === 'user_request') {
      return result('denied', null, 'route_not_in_projection');
    }
    // An access change may require leaving a now-hidden page. Suggest only a
    // route already in this projection; never fabricate Home/More permissions.
    const fallback = navigation.mobile[0]?.route || navigation.secondary[0]?.route || null;
    return fallback && allowed.has(fallback)
      ? result('fallback_suggested', fallback, 'prior_route_no_longer_visible')
      : result('blocked', null, 'no_permitted_destination');
  }
  return Object.freeze({ version: 1, projectNavigation, resolveRouteIntent,
    legacyMobileRoutes: LEGACY_MOBILE });
});
