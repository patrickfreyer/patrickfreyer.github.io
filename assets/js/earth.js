import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// Ensure required data is available
if (typeof locationsData === 'undefined' || typeof flightRoutesData === 'undefined') {
    console.error('Required data is not defined. Make sure locationsData and flightRoutesData are passed correctly from Jekyll.');
} else {
    initEarth();
}

// Helper function to get base URL for assets
function getBaseURL() {
    // Get the base URL from Jekyll if available, otherwise assume root
    return window.baseURL || '';
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
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Earth Geometry and Materials Setup
    const earthRadius = 5;
    const textureLoader = new THREE.TextureLoader();
    const baseURL = getBaseURL();
    
    // Load all textures with proper base URL
    const textures = {
        earth: textureLoader.load(baseURL + 'assets/textures/earth_albedo.jpg'),
        night: textureLoader.load(baseURL + 'assets/textures/earth_night.jpg'),
        normal: textureLoader.load(baseURL + 'assets/textures/earth_normal.jpg'),
        specular: textureLoader.load(baseURL + 'assets/textures/earth_specular.jpg'),
        roughness: textureLoader.load(baseURL + 'assets/textures/earth_roughness.jpg'),
        clouds: textureLoader.load(baseURL + 'assets/textures/earth_clouds.jpg'),
        bump: textureLoader.load(baseURL + 'assets/textures/earth_bump.jpg')
    };

    // Base Earth Layer
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: textures.earth,
        normalMap: textures.normal,
        specularMap: textures.specular,
        bumpMap: textures.bump,
        bumpScale: 0.05,
        specular: new THREE.Color(0x333333),
        shininess: 25
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // Night Lights Layer
    const nightGeometry = new THREE.SphereGeometry(earthRadius * 1.001, 64, 64);
    const nightMaterial = new THREE.MeshBasicMaterial({
        map: textures.night,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
    });
    const nightLayer = new THREE.Mesh(nightGeometry, nightMaterial);
    earth.add(nightLayer);

    // Cloud Layer
    const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: textures.clouds,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending
    });
    const cloudLayer = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earth.add(cloudLayer);

    // Enhanced Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemisphereLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
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
    function animate() {
        requestAnimationFrame(animate);

        // Update Controls
        controls.update();

        // Rotate cloud layer
        cloudLayer.rotation.y += 0.0003;

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

    // Start animation once textures are loaded
    Promise.all(Object.values(textures).map(texture => 
        new Promise(resolve => {
            if (texture.image) resolve();
            texture.addEventListener('load', resolve);
        })
    )).then(() => {
        console.log("All textures loaded, starting animation");
        animate();
    });

    console.log("Three.js Earth initialized");
} 