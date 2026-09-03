// Alpine drives the mobile nav toggle. Previously loaded from unpkg at runtime
// (`alpinejs@3.x.x`, an unpinned floating version); now bundled from a pinned
// npm dependency so the version cannot change under us.
import Alpine from 'alpinejs';

window.Alpine = Alpine;
Alpine.start();
