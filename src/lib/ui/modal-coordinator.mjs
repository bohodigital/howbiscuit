const MODAL_IDS = new Set(['mobile-navigation', 'search']);
const CLOSE_REASONS = new Set(['button', 'escape', 'outside', 'replacement', 'result']);

export function createInitialModalState() {
  return Object.freeze({ openModalId: null, returnFocusId: null });
}

export function resolveModalFocusReturnId(requestedId, desktopNavigationActive) {
  if (typeof requestedId !== 'string' || !requestedId) throw new Error('A focus-return target is required.');
  if (typeof desktopNavigationActive !== 'boolean') throw new Error('Desktop-navigation state must be a boolean.');
  if (requestedId === 'search-trigger' || requestedId === 'mobile-search-trigger') {
    return desktopNavigationActive ? 'search-trigger' : 'mobile-search-trigger';
  }
  return requestedId;
}

export function reduceModalState(state, event) {
  if (!state || typeof state !== 'object') throw new Error('Modal state is required.');
  if (!event || typeof event !== 'object') throw new Error('A modal event is required.');

  if (event.type === 'open') {
    if (!MODAL_IDS.has(event.modalId)) throw new Error(`Unknown modal: ${event.modalId}`);
    if (typeof event.returnFocusId !== 'string' || !event.returnFocusId) {
      throw new Error('Opening a modal requires a focus-return target.');
    }
    return Object.freeze({
      openModalId: event.modalId,
      returnFocusId: event.returnFocusId,
    });
  }

  if (event.type === 'close') {
    if (state.openModalId === null) return state;
    if (!CLOSE_REASONS.has(event.reason)) throw new Error(`Unknown modal close reason: ${event.reason}`);
    return Object.freeze({
      openModalId: null,
      returnFocusId: null,
      focusTargetId: state.returnFocusId,
      closeReason: event.reason,
    });
  }

  throw new Error(`Unknown modal event: ${event.type}`);
}
