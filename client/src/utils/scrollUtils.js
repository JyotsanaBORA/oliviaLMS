/**
 * Utility function to scroll to top with fallback options
 * Handles different scroll containers in the application
 */
export const scrollToTop = () => {
  // First try to find the main content area
  const mainContent = document.querySelector('main.overflow-y-auto');
  if (mainContent) {
    mainContent.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
    return;
  }

  // Try to find any scrollable container
  const scrollableContainer = document.querySelector('.overflow-y-auto');
  if (scrollableContainer) {
    scrollableContainer.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
    return;
  }

  // Fallback to window scroll
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth'
  });
};

/**
 * Alternative scroll to top with instant behavior
 */
export const scrollToTopInstant = () => {
  const mainContent = document.querySelector('main.overflow-y-auto');
  if (mainContent) {
    mainContent.scrollTop = 0;
    return;
  }

  const scrollableContainer = document.querySelector('.overflow-y-auto');
  if (scrollableContainer) {
    scrollableContainer.scrollTop = 0;
    return;
  }

  window.scrollTo(0, 0);
};