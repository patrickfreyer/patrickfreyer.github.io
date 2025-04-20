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

// Helper function to count route frequencies
function countRouteFrequencies(routes) {
    const frequencies = {};
    
    routes.forEach(route => {
        // Create a consistent key for the route (sort cities alphabetically to count both directions)
        const cities = [route.origin, route.destination].sort();
        const routeKey = `${cities[0]}-${cities[1]}`;
        frequencies[routeKey] = (frequencies[routeKey] || 0) + 1;
    });
    
    return frequencies;
}

// Function to get route frequency
function getRouteFrequency(origin, destination, frequencies) {
    const cities = [origin, destination].sort();
    const routeKey = `${cities[0]}-${cities[1]}`;
    return frequencies[routeKey] || 1;
}

// Function to create curved flight path
function createFlightPath(startPoint, endPoint, earthRadius, numLines = 1) {
    const pathsPoints = [];
    const numPoints = 50;
    
    // Calculate distance for height scaling
    const distance = startPoint.distanceTo(endPoint);
    const maxHeightScale = 0.08;
    const baseScale = Math.atan(distance) / (Math.PI / 2) * maxHeightScale;

    // Generate base curved path points
    const basePoints = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const point = startPoint.clone().normalize();
        point.lerp(endPoint.clone().normalize(), t).normalize();
        const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
        point.multiplyScalar(heightScale);
        basePoints.push(point);
    }

    // Calculate perpendicular direction for parallel lines
    const pathDirection = endPoint.clone().sub(startPoint).normalize();
    const globeNormal = startPoint.clone().add(endPoint).normalize();
    const perpDirection = pathDirection.clone().cross(globeNormal).normalize();

    // Create offset paths
    for (let i = 0; i < numLines; i++) {
        const offset = perpDirection.clone().multiplyScalar(0.01 * (i - (numLines - 1) / 2));
        const offsetPoints = basePoints.map(point => {
            return point.clone().add(offset);
        });
        pathsPoints.push(offsetPoints);
    }

    return pathsPoints;
}

// Function to create flight path lines
function createFlightLines(pathsPoints, color = 0x00ff00) {
    const lines = [];
    pathsPoints.forEach(points => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6,
            linewidth: 1,
            depthTest: true,
            depthWrite: false
        });
        lines.push(new THREE.Line(geometry, material));
    });
    return lines;
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
    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true,
        logarithmicDepthBuffer: true // Helps with z-fighting
    });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Earth radius and state
    const earthRadius = 5;
    const state = {
        isDaylight: true // Can be toggled for day/night transitions
    };

    // Texture Loader
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path) => textureLoader.load(`https://patrickfreyer.com/assets/${path}`);

    // Load all textures
    const earthDayTexture = loadTexture('earth_albedo.jpg');
    const earthNightTexture = loadTexture('earth_night.jpg');
    const normalTexture = loadTexture('earth_normal.jpg');
    const specularTexture = loadTexture('earth_specular.jpg');
    const roughnessTexture = loadTexture('earth_roughness.jpg');
    const bumpTexture = loadTexture('earth_bump.jpg');
    const cloudsTexture = loadTexture('earth_clouds.jpg');

    // 1. Base Earth Layer
    const globeGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
        map: earthDayTexture,
        normalMap: normalTexture,
        normalScale: new THREE.Vector2(0.8, 0.8),
        specularMap: specularTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.02,
        specular: new THREE.Color(0x444444),
        shininess: 15
    });
    const earthMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(earthMesh);

    // 2. Night Lights Layer
    const nightGeometry = new THREE.SphereGeometry(earthRadius * 1.001, 64, 64);
    const nightMaterial = new THREE.MeshBasicMaterial({
        map: earthNightTexture,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: state.isDaylight ? 0 : 0.8,
        depthWrite: false
    });
    const nightMesh = new THREE.Mesh(nightGeometry, nightMaterial);
    scene.add(nightMesh);

    // 3. Cloud Layer
    const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudsTexture,
        transparent: true,
        opacity: state.isDaylight ? 0.3 : 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending
    });
    const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(cloudMesh);

    // Enhanced Lighting System
    // 1. Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, state.isDaylight ? 0.3 : 0.1);
    scene.add(ambientLight);

    // 2. Directional Light (Sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, state.isDaylight ? 2.0 : 0.15);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // 3. Hemisphere Light
    const hemisphereLight = new THREE.HemisphereLight(
        0xffffff,   // Sky color
        0x444444,   // Ground color
        state.isDaylight ? 0.6 : 0
    );
    scene.add(hemisphereLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 8;
    controls.maxDistance = 12;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

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
        
        // Create the main pin head (sphere) - reduced by 40%
        const headGeometry = new THREE.SphereGeometry(0.024, 12, 12); // from 0.04 to 0.024
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff3333,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            shininess: 100
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        
        // Create the pin point (cone) - reduced by 40%
        const pointGeometry = new THREE.ConeGeometry(0.018, 0.06, 6); // from 0.03/0.1 to 0.018/0.06
        const pointMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff3333,
            emissive: 0xff0000,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const point = new THREE.Mesh(pointGeometry, pointMaterial);
        point.position.y = -0.09; // from -0.15 to -0.09
        point.rotation.x = Math.PI;

        // Create a glow effect - reduced by 40%
        const glowGeometry = new THREE.SphereGeometry(0.072, 16, 16); // from 0.12 to 0.072
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
        
        earthMesh.add(pin);
        console.log(`Adding pin for ${location.name} at`, position);
    });

    // Count route frequencies before adding flight paths
    const routeFrequencies = countRouteFrequencies(flightRoutesData);
    
    // Track processed routes to avoid duplicates
    const processedRoutes = new Set();
    
    // Add flight paths
    flightRoutesData.forEach(route => {
        // Create a consistent key for the route
        const cities = [route.origin, route.destination].sort();
        const routeKey = `${cities[0]}-${cities[1]}`;
        
        // Skip if we've already processed this route
        if (processedRoutes.has(routeKey)) {
            return;
        }
        processedRoutes.add(routeKey);
        
        const originLoc = findLocationByName(route.origin);
        const destLoc = findLocationByName(route.destination);
        
        if (!originLoc || !destLoc) {
            console.warn(`Could not find location data for route: ${route.origin} -> ${route.destination}`);
            return;
        }

        const startPoint = latLonToVector3(originLoc.lat, originLoc.lon, earthRadius);
        const endPoint = latLonToVector3(destLoc.lat, destLoc.lon, earthRadius);
        
        // Get the actual frequency for this route
        const frequency = getRouteFrequency(route.origin, route.destination, routeFrequencies);
        const numLines = Math.min(Math.max(frequency, 1), 5); // Cap between 1 and 5 lines
        
        const pathsPoints = createFlightPath(startPoint, endPoint, earthRadius, numLines);
        
        // Create flight lines with airline-specific color
        const airlineColors = {
            'default': 0x00ff00
        };
        const flightLines = createFlightLines(pathsPoints, airlineColors[route.airline] || airlineColors.default);
        
        // Add all lines to the earth
        flightLines.forEach(line => earthMesh.add(line));
        
        console.log(`Added flight path with ${numLines} lines for route ${route.origin} -> ${route.destination} (frequency: ${frequency})`);
    });

    // Initial Camera Position
    camera.position.z = 12;

    // Animation Loop with cloud rotation
    let frameCount = 0;
    function animate() {
        requestAnimationFrame(animate);

        frameCount++;

        // Rotate clouds slightly faster than the Earth
        if (cloudMesh) {
            cloudMesh.rotation.y = earthMesh.rotation.y * 1.1;
        }

        // Update Controls
        controls.update();

        renderer.render(scene, camera);
    }

    // Handle Window Resize
    function onWindowResize() {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    window.addEventListener('resize', onWindowResize, false);

    // Start animation when textures are loaded
    Promise.all([
        earthDayTexture,
        earthNightTexture,
        normalTexture,
        specularTexture,
        roughnessTexture,
        bumpTexture,
        cloudsTexture
    ]).then(() => {
        console.log("All textures loaded successfully");
        animate();
    }).catch(error => {
        console.error('Error loading textures:', error);
        // Start animation anyway to show at least something
        animate();
    });

    console.log("Three.js Earth initialized with enhanced visualization");
} 