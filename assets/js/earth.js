import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// Ensure required data is available
if (typeof locationsData === 'undefined' || typeof flightRoutesData === 'undefined') {
    console.error('Required data is not defined. Make sure locationsData and flightRoutesData are passed correctly from Jekyll.');
} else {
    initEarth();
}

// Helper function to find location data by name
function findLocationByName(name) {
    return locationsData.find(loc => loc.name === name);
}

// Function to create curved flight path
function createFlightPath(startPoint, endPoint, earthRadius) {
    const points = [];
    const numPoints = 50;
    
    // Calculate distance for height scaling
    const distance = startPoint.distanceTo(endPoint);
    const maxHeightScale = 0.08;
    const baseScale = Math.atan(distance) / (Math.PI / 2) * maxHeightScale;

    // Generate curved path points
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const point = startPoint.clone().normalize();
        point.lerp(endPoint.clone().normalize(), t).normalize();
        const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
        point.multiplyScalar(heightScale);
        points.push(point);
    }

    return points;
}

// Function to create flight path line
function createFlightLine(points, color = 0x00ff00) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        linewidth: 1,
        depthTest: true,
        depthWrite: false
    });
    return new THREE.Line(geometry, material);
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // Soft white light
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.4, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10; // Prevent zooming in too close
    controls.maxDistance = 12; // Prevent zooming out too far
    controls.enablePan = false; // Disable panning (optional, keeps focus on rotation)
    controls.autoRotate = true; // Disable auto-rotate for testing interaction
    controls.autoRotateSpeed = 0.3; // Optional: auto-rotate speed

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
    // Create a group for the pin meshes
    const createPin = () => {
        const pinGroup = new THREE.Group();
        
        // Create the main pin head (sphere)
        const headGeometry = new THREE.SphereGeometry(0.04, 12, 12);
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff3333,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            shininess: 100
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        
        // Create the pin point (cone)
        const pointGeometry = new THREE.ConeGeometry(0.03, 0.1, 6);
        const pointMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff3333,
            emissive: 0xff0000,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const point = new THREE.Mesh(pointGeometry, pointMaterial);
        point.position.y = -0.15;
        point.rotation.x = Math.PI;

        // Create a glow effect
        const glowGeometry = new THREE.SphereGeometry(0.12, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6666,
            transparent: true,
            opacity: 0.4
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);

        pinGroup.add(head);
        pinGroup.add(point);
        pinGroup.add(glow);

        return pinGroup;
    };

    locationsData.forEach(location => {
        const position = latLonToVector3(location.lat, location.lon, earthRadius);
        const pin = createPin();
        
        // Calculate the rotation to make the pin point towards the earth's center
        const normal = position.clone().normalize();
        pin.position.copy(position);
        pin.lookAt(new THREE.Vector3(0, 0, 0));
        pin.rotateX(Math.PI / 2);
        
        earth.add(pin);
        console.log(`Adding pin for ${location.name} at`, position);
    });

    // Add flight paths
    flightRoutesData.forEach(route => {
        const originLoc = findLocationByName(route.origin);
        const destLoc = findLocationByName(route.destination);
        
        if (!originLoc || !destLoc) {
            console.warn(`Could not find location data for route: ${route.origin} -> ${route.destination}`);
            return;
        }

        const startPoint = latLonToVector3(originLoc.lat, originLoc.lon, earthRadius);
        const endPoint = latLonToVector3(destLoc.lat, destLoc.lon, earthRadius);
        
        // Create curved path
        const pathPoints = createFlightPath(startPoint, endPoint, earthRadius);
        
        // Create flight line with airline-specific color
        const airlineColors = {
            'Delta': 0x0039A6, // Delta Blue
            'default': 0x00ff00 // Default green
        };
        const flightLine = createFlightLine(pathPoints, airlineColors[route.airline] || airlineColors.default);
        earth.add(flightLine);
        
        console.log(`Added flight path: ${route.origin} -> ${route.destination}`);
    });

    // Initial Camera Position
    camera.position.z = 12;

    // Animation Loop
    let frameCount = 0;
    function animate() {
        requestAnimationFrame(animate);

        // Log frame count periodically to check if loop is running
        if (frameCount % 60 === 0) {
            // console.log(`Animate loop running - Frame: ${frameCount}`);
        }
        frameCount++;

        // Update Controls
        controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true

        // Rotation (removed, OrbitControls handles interaction)
        // earth.rotation.y += 0.001;

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