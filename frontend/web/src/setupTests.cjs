// Jest global setup. Plain CommonJS because the project does not configure a
// TS transformer for Jest setup files.
require('@testing-library/jest-dom');

if (typeof window !== 'undefined') {
// Mock window.matchMedia for Tailwind CSS components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: function (query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  },
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// jsdom does not implement the native dialog lifecycle.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

}
