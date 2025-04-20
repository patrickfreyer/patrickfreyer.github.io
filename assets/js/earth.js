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

    // Debug container dimensions
    console.log('Container dimensions:', {
        width: container.clientWidth,
        height: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        style: container.style.cssText
    });

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Debug renderer
    console.log('Renderer canvas dimensions:', {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        style: renderer.domElement.style.cssText
    });

    // Clear background to a visible color temporarily for debugging
    scene.background = new THREE.Color(0x111111);
    renderer.setClearColor(0x111111, 1);

    // Earth Geometry and Materials Setup
    const earthRadius = 5;
    const textureLoader = new THREE.TextureLoader();
    
    // Create basic material first
    const earthGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
    const earthMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2288ff  // Start with a basic blue color
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // Start animation immediately
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Load textures and enhance material after
    const textures = {
        earth: textureLoader.load('/assets/earth_albedo.jpg',
            (texture) => {
                console.log("Earth texture loaded");
                earthMaterial.map = texture;
                earthMaterial.needsUpdate = true;
            },
            undefined,
            () => {
                console.log("Failed to load earth texture, falling back to color");
                // Already using fallback color
            }
        ),
        night: textureLoader.load('/assets/earth_night.jpg',
            (texture) => {
                console.log("Night texture loaded");
                if (!nightLayer) {
                    const nightGeometry = new THREE.SphereGeometry(earthRadius * 1.001, 64, 64);
                    const nightMaterial = new THREE.MeshBasicMaterial({
                        map: texture,
                        blending: THREE.AdditiveBlending,
                        transparent: true,
                        opacity: 0.8,
                        depthWrite: false
                    });
                    const nightLayer = new THREE.Mesh(nightGeometry, nightMaterial);
                    earth.add(nightLayer);
                }
            }
        ),
        clouds: textureLoader.load('/assets/earth_clouds.jpg',
            (texture) => {
                console.log("Cloud texture loaded");
                if (!cloudLayer) {
                    const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.008, 64, 64);
                    const cloudMaterial = new THREE.MeshPhongMaterial({
                        map: texture,
                        transparent: true,
                        opacity: 0.4,
                        depthWrite: false,
                        side: THREE.DoubleSide,
                        blending: THREE.NormalBlending
                    });
                    cloudLayer = new THREE.Mesh(cloudGeometry, cloudMaterial);
                    earth.add(cloudLayer);
                }
            }
        )
    };

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
    console.log('Camera position:', camera.position);

    // Handle Window Resize
    function onWindowResize() {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    window.addEventListener('resize', onWindowResize, false);

    // Add immediate visibility check
    setTimeout(() => {
        console.log('Delayed visibility check:', {
            containerVisible: container.offsetWidth > 0 && container.offsetHeight > 0,
            rendererVisible: renderer.domElement.width > 0 && renderer.domElement.height > 0,
            cameraPosition: camera.position,
            sceneChildren: scene.children.length
        });
    }, 1000);  // Check after 1 second

    console.log("Three.js Earth initialized");
} 