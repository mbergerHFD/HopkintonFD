document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menu-toggle');
    const nav = document.querySelector('nav');
    const isOpen = false;

    menuToggle.addEventListener('click', function() {
        const isCurrentlyOpen = nav.classList.contains('menu-open');
        
        // Toggle the menu-open class
        nav.classList.toggle('menu-open');
        
        // Update ARIA attribute for accessibility
        menuToggle.setAttribute('aria-expanded', !isCurrentlyOpen);
        
        // Optional: Toggle the button's class for animation
        menuToggle.classList.toggle('menu-open');
        
        // Optional: Close menu when clicking outside (enhances UX)
        if (!isCurrentlyOpen) {
            document.addEventListener('click', closeMenuOnOutsideClick);
        } else {
            document.removeEventListener('click', closeMenuOnOutsideClick);
        }
    });

    // Function to close menu on outside click
    function closeMenuOnOutsideClick(event) {
        if (!nav.contains(event.target) && !menuToggle.contains(event.target)) {
            nav.classList.remove('menu-open');
            menuToggle.classList.remove('menu-open');
            menuToggle.setAttribute('aria-expanded', 'false');
            document.removeEventListener('click', closeMenuOnOutsideClick);
        }
    }

    // Close menu on window resize to desktop (if it was open on mobile)
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && nav.classList.contains('menu-open')) {
            nav.classList.remove('menu-open');
            menuToggle.classList.remove('menu-open');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
    });
});