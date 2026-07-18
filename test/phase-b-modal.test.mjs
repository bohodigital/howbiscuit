import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInitialModalState,
  modalFocusReturnCandidates,
  reduceModalState,
} from '../src/lib/ui/modal-coordinator.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('one shared coordinator keeps mobile navigation and search mutually exclusive', () => {
  const initial = createInitialModalState();
  const navigationOpen = reduceModalState(initial, {
    type: 'open',
    modalId: 'mobile-navigation',
    returnFocusId: 'mobile-navigation-trigger',
  });
  assert.deepEqual(navigationOpen, {
    openModalId: 'mobile-navigation',
    returnFocusId: 'mobile-navigation-trigger',
  });

  const searchOpen = reduceModalState(navigationOpen, {
    type: 'open',
    modalId: 'search',
    returnFocusId: 'search-trigger',
  });
  assert.deepEqual(searchOpen, {
    openModalId: 'search',
    returnFocusId: 'search-trigger',
  });
});

test('closing is idempotent and reports the focus-return target exactly once', () => {
  const open = reduceModalState(createInitialModalState(), {
    type: 'open',
    modalId: 'search',
    returnFocusId: 'search-trigger',
  });
  const closed = reduceModalState(open, { type: 'close', reason: 'escape' });
  assert.deepEqual(closed, {
    openModalId: null,
    returnFocusId: null,
    focusTargetId: 'search-trigger',
    closeReason: 'escape',
  });
  assert.deepEqual(reduceModalState(closed, { type: 'close', reason: 'outside' }), closed);
});

test('unknown modal identifiers and malformed events fail closed', () => {
  assert.throws(() => reduceModalState(createInitialModalState(), {
    type: 'open',
    modalId: 'not-a-real-modal',
    returnFocusId: 'trigger',
  }), /unknown modal/i);
  assert.throws(() => reduceModalState(createInitialModalState(), { type: 'surprise' }), /unknown modal event/i);
});

test('the mobile dialog is dismissed without focusing a hidden trigger when desktop navigation returns', () => {
  const header = readFileSync(path.join(root, 'src', 'components', 'SiteHeader.astro'), 'utf8');
  assert.match(header, /desktopNavigationMedia/);
  assert.match(header, /closeModal\('replacement', false\)/);
});

test('search focus return follows the visible trigger across the navigation breakpoint', () => {
  assert.deepEqual(modalFocusReturnCandidates('mobile-search-trigger'), ['mobile-search-trigger', 'search-trigger']);
  assert.deepEqual(modalFocusReturnCandidates('search-trigger'), ['search-trigger', 'mobile-search-trigger']);
  assert.deepEqual(modalFocusReturnCandidates('mobile-navigation-trigger'), ['mobile-navigation-trigger']);
  assert.throws(() => modalFocusReturnCandidates(''), /focus-return target/i);

  const header = readFileSync(path.join(root, 'src', 'components', 'SiteHeader.astro'), 'utf8');
  assert.match(header, /modalFocusReturnCandidates\(modalState\.focusTargetId\)/);
  assert.match(header, /candidate\.getClientRects\(\)\.length > 0/);
});
