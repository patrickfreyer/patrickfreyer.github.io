import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

// Ensure locationsData is available
if (typeof locationsData === 'undefined') {
    console.error('locationsData is not defined. Make sure it is passed correctly from Jekyll.');
} else {
    initEarth();
}

function initEarth() {
    const container = document.getElementById('earth-container');
    if (!container) {
        console.error('Earth container not found');
        return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); // alpha:true for transparent background

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Earth Geometry
    const earthRadius = 5;
    const geometry = new THREE.SphereGeometry(earthRadius, 64, 64);

    // Earth Material (using a simple color for now, texture loading added below)
    // const material = new THREE.MeshStandardMaterial({ color: 0x2288ff }); // Placeholder blue color
    // Earth Material (Texture Loading)
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg', // Example texture
        () => { console.log("Texture loaded successfully"); animate(); }, // Start animation once texture loads
        undefined, // onProgress callback currently not supported
        (err) => { console.error('An error happened loading the texture:', err); }
    );
    const material = new THREE.MeshStandardMaterial({ map: earthTexture });

    const earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Soft white light
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.8, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Function to convert Lat/Lon to 3D coordinates
    function latLonToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const x = -(radius * Math.sin(phi) * Math.cos(theta));
        const z = radius * Math.sin(phi) * Math.sin(theta);
        const y = radius * Math.cos(phi);

        return new THREE.Vector3(x, y, z);
    }

    // Add pins for locations
    const pinGeometry = new THREE.SphereGeometry(0.08, 16, 16); // Small sphere for pins
    const pinMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red color for pins

    locationsData.forEach(location => {
        const position = latLonToVector3(location.lat, location.lon, earthRadius);
        const pin = new THREE.Mesh(pinGeometry, pinMaterial);
        pin.position.copy(position);
        earth.add(pin); // Add pins as children of the earth so they rotate with it
        console.log(`Adding pin for ${location.name} at`, position);
    });

    // Initial Camera Position
    camera.position.z = 12;

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        // Rotation
        earth.rotation.y += 0.001; // Adjust speed as needed

        renderer.render(scene, camera);
    }

    // Handle Window Resize
    function onWindowResize() {
        if (!container) return; // Check if container still exists
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    window.addEventListener('resize', onWindowResize, false);

    // Start animation (if texture loads instantly or fails)
    // animate(); // Now called within texture loader callback

     console.log("Three.js Earth initialized");
} 