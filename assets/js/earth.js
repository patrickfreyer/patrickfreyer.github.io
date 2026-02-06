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

// Function to create curved flight path using great circle
function createFlightPath(startPoint, endPoint, earthRadius, numLines = 1, numPoints = 50) {
    const pathsPoints = [];
    
    // Normalize the start and end points to get unit vectors
    const startNormalized = startPoint.clone().normalize();
    const endNormalized = endPoint.clone().normalize();
    
    // Calculate the great circle distance (angle between points)
    const dotProduct = startNormalized.dot(endNormalized);
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    
    // Calculate distance for height scaling
    const distance = startPoint.distanceTo(endPoint);
    const maxHeightScale = 0.08;
    const baseScale = Math.atan(distance) / (Math.PI / 2) * maxHeightScale;

    // Generate base curved path points using great circle interpolation
    const basePoints = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        
        // Use spherical linear interpolation (slerp) for great circle
        const sinAngle = Math.sin(angle);
        if (sinAngle === 0) {
            // Points are the same or opposite, use direct interpolation
            const point = startNormalized.clone().lerp(endNormalized, t);
            const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
            point.normalize().multiplyScalar(heightScale);
            basePoints.push(point);
        } else {
            // Use proper spherical interpolation
            const sinT = Math.sin(t * angle);
            const sinOneMinusT = Math.sin((1 - t) * angle);
            
            const point = new THREE.Vector3();
            point.addScaledVector(startNormalized, sinOneMinusT / sinAngle);
            point.addScaledVector(endNormalized, sinT / sinAngle);
            
            // Add height curve above the great circle
            const heightScale = earthRadius * (1 + baseScale * Math.sin(Math.PI * t));
            point.normalize().multiplyScalar(heightScale);
            basePoints.push(point);
        }
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
function createFlightLines(pathsPoints, color = 0x00ff00, enableGlow = true) {
    const lines = [];
    pathsPoints.forEach(points => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create a brighter version of the color for better contrast
        const brightColor = new THREE.Color(color);
        brightColor.multiplyScalar(1.5); // Make it 50% brighter
        
        const material = new THREE.LineBasicMaterial({
            color: brightColor,
            transparent: false, // No transparency
            linewidth: 3,
            depthTest: true,
            depthWrite: true, // Write to depth buffer
            side: THREE.FrontSide
        });
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 1; // Render after earth mesh
        
        // Add a glow effect by creating a thicker line behind
        if (enableGlow) {
            const glowGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const glowMaterial = new THREE.LineBasicMaterial({
                color: brightColor,
                transparent: true,
                opacity: 0.4,
                linewidth: 5, // Thicker glow line
                depthTest: true,
                depthWrite: false, // Don't write to depth buffer
                side: THREE.FrontSide
            });
            const glowLine = new THREE.Line(glowGeometry, glowMaterial);
            glowLine.renderOrder = 0; // Render before main line
            lines.push(glowLine); // Add glow first (behind)
        }
        lines.push(line); // Add main line on top
    });
    return lines;
}

// Add these functions before initEarth()
function getUniqueValues(data, key) {
    if (key === 'travelers') {
        // Special handling for travelers array
        const allTravelers = new Set();
        data.forEach(item => {
            if (Array.isArray(item[key])) {
                item[key].forEach(traveler => allTravelers.add(traveler));
            }
        });
        return [...allTravelers].sort();
    }
    return [...new Set(data.map(item => item[key]))].filter(Boolean).sort();
}

function populateFilterDropdowns(flightData) {
    const years = getUniqueValues(flightData, 'year');
    const airlines = getUniqueValues(flightData, 'airline');
    const occasions = getUniqueValues(flightData, 'occasion');
    const months = getUniqueValues(flightData, 'month');
    const travelers = getUniqueValues(flightData, 'travelers');

    // Helper function to populate dropdowns
    function populateDropdown(elementId, values) {
        const select = document.getElementById(elementId);
        if (!select) return;
        
        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    }

    populateDropdown('year-filter', years);
    populateDropdown('airline-filter', airlines);
    populateDropdown('occasion-filter', occasions);
    populateDropdown('month-filter', months);
    populateDropdown('travelers-filter', travelers);
}

function getSelectedValues(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return [];
    return Array.from(element.selectedOptions).map(option => option.value);
}

function filterFlightData(data, filters) {
    return data.filter(flight => {
        // Convert years to numbers for comparison
        const yearMatch = filters.years.length === 0 || 
            filters.years.map(Number).includes(Number(flight.year));
        const airlineMatch = filters.airlines.length === 0 || filters.airlines.includes(flight.airline);
        const occasionMatch = filters.occasions.length === 0 || filters.occasions.includes(flight.occasion);
        const monthMatch = filters.months.length === 0 || filters.months.includes(flight.month);
        
        // Check if any selected travelers are in the flight's travelers array
        const travelersMatch = filters.travelers.length === 0 || 
            (Array.isArray(flight.travelers) && 
             filters.travelers.some(traveler => flight.travelers.includes(traveler)));

        return yearMatch && airlineMatch && occasionMatch && monthMatch && travelersMatch;
    });
}

function setupFilterHandlers(earthMesh, initializeFlightPaths, clearFlightLines, scene) {
    const applyButton = document.getElementById('apply-filters');
    const resetButton = document.getElementById('reset-filters');
    const toggleButton = document.getElementById('toggle-filters');
    const filterPanel = document.getElementById('filter-panel');

    // Setup toggle functionality
    if (toggleButton && filterPanel) {
        toggleButton.addEventListener('click', () => {
            filterPanel.classList.toggle('collapsed');
        });
    }

    if (applyButton) {
        applyButton.addEventListener('click', () => {
            const filters = {
                years: getSelectedValues('year-filter'),
                airlines: getSelectedValues('airline-filter'),
                occasions: getSelectedValues('occasion-filter'),
                months: getSelectedValues('month-filter'),
                travelers: getSelectedValues('travelers-filter')
            };

            // Remove existing flight paths from scene
            clearFlightLines();

            // Apply filtered data
            const filteredData = filterFlightData(flightRoutesData, filters);
            initializeFlightPaths(filteredData, earthMesh);
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            // Clear all selections
            ['year-filter', 'airline-filter', 'occasion-filter', 'month-filter', 'travelers-filter'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.selectedIndex = -1;
            });

            // Reset to original data
            clearFlightLines();
            initializeFlightPaths(flightRoutesData, earthMesh);
        });
    }
}

// Function to generate distinct colors
function generateDistinctColors(count) {
    // Simplified, bright color palette for better visibility
    const baseColors = [
        0xFFFF00, // Bright Yellow
        0xFF8C00, // Bright Orange
        0x00BFFF, // Bright Blue
        0xFFFFFF, // White
        0xFF1493, // Deep Pink
        0x00FF00, // Bright Green
        0xFF4500, // Orange Red
        0x00FFFF, // Cyan
        0xFFD700, // Gold
        0xFF69B4, // Hot Pink
        0x00CED1, // Dark Turquoise
        0xFF6347  // Tomato
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
        // Use modulo to cycle through colors if we need more than the base palette
        colors.push(baseColors[i % baseColors.length]);
    }
    
    return colors;
}

function initEarth() {
    const container = document.getElementById('earth-container');
    if (!container) {
        console.error('Earth container not found');
        return;
    }

    const deviceProfile = {
        memory: navigator.deviceMemory || 4,
        cores: navigator.hardwareConcurrency || 4,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        smallScreen: window.matchMedia('(max-width: 768px)').matches
    };

    const lowPowerMode = deviceProfile.memory <= 4 || deviceProfile.cores <= 4 || deviceProfile.reducedMotion || deviceProfile.smallScreen;
    const quality = lowPowerMode ? {
        segments: 32,
        cloudSegments: 24,
        pixelRatio: 1,
        enableClouds: false,
        enableNight: false,
        enableGlow: false,
        maxRouteLines: 3,
        pathPoints: 24,
        pinDetail: 6,
        useAdvancedMaterial: false,
        frameRate: 30
    } : {
        segments: 64,
        cloudSegments: 48,
        pixelRatio: 1.5,
        enableClouds: true,
        enableNight: true,
        enableGlow: true,
        maxRouteLines: 10,
        pathPoints: 60,
        pinDetail: 12,
        useAdvancedMaterial: true,
        frameRate: 60
    };

    const performancePill = document.getElementById('performance-pill');
    if (performancePill) {
        performancePill.textContent = lowPowerMode ? 'Low power mode' : 'High fidelity mode';
        performancePill.style.background = lowPowerMode ? 'rgba(234, 179, 8, 0.2)' : 'rgba(34, 197, 94, 0.2)';
        performancePill.style.borderColor = lowPowerMode ? 'rgba(234, 179, 8, 0.4)' : 'rgba(34, 197, 94, 0.4)';
        performancePill.style.color = lowPowerMode ? '#fde68a' : '#bbf7d0';
    }

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: !lowPowerMode,
        powerPreference: lowPowerMode ? 'low-power' : 'high-performance',
        logarithmicDepthBuffer: true // Helps with z-fighting
    });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    container.appendChild(renderer.domElement);

    // Earth radius and state
    const earthRadius = 5;
    const state = {
        isDaylight: true // Can be toggled for day/night transitions
    };

    // Texture Loader
    const loadingManager = new THREE.LoadingManager();
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const loadTexture = (path) => textureLoader.load(`https://patrickfreyer.com/assets/${path}`);

    // Load all textures
    const earthDayTexture = loadTexture('earth_albedo.jpg');
    const earthNightTexture = quality.enableNight ? loadTexture('earth_night.jpg') : null;
    const normalTexture = quality.useAdvancedMaterial ? loadTexture('earth_normal.jpg') : null;
    const specularTexture = quality.useAdvancedMaterial ? loadTexture('earth_specular.jpg') : null;
    const roughnessTexture = quality.useAdvancedMaterial ? loadTexture('earth_roughness.jpg') : null;
    const bumpTexture = quality.useAdvancedMaterial ? loadTexture('earth_bump.jpg') : null;
    const cloudsTexture = quality.enableClouds ? loadTexture('earth_clouds.jpg') : null;

    // 0. Solid Base Sphere (to prevent flight routes from showing through)
    const baseGeometry = new THREE.SphereGeometry(earthRadius, quality.segments, quality.segments);
    const baseMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000, // Black color
        side: THREE.FrontSide
    });
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.renderOrder = -1; // Render first, before everything else
    scene.add(baseMesh);

    // 1. Base Earth Layer
    const globeGeometry = new THREE.SphereGeometry(earthRadius, quality.segments, quality.segments);
    const globeMaterial = quality.useAdvancedMaterial ? new THREE.MeshPhongMaterial({
        map: earthDayTexture,
        normalMap: normalTexture,
        normalScale: new THREE.Vector2(0.8, 0.8),
        specularMap: specularTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.02,
        specular: new THREE.Color(0x444444),
        shininess: 15
    }) : new THREE.MeshLambertMaterial({
        map: earthDayTexture
    });
    const earthMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    earthMesh.renderOrder = 0; // Render first
    scene.add(earthMesh);

    // 2. Night Lights Layer
    let nightMesh = null;
    if (quality.enableNight && earthNightTexture) {
        const nightGeometry = new THREE.SphereGeometry(earthRadius * 1.001, quality.segments, quality.segments);
        const nightMaterial = new THREE.MeshBasicMaterial({
            map: earthNightTexture,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: state.isDaylight ? 0 : 0.8,
            depthWrite: false
        });
        nightMesh = new THREE.Mesh(nightGeometry, nightMaterial);
        nightMesh.renderOrder = 0; // Render first
        scene.add(nightMesh);
    }

    // 3. Cloud Layer
    let cloudMesh = null;
    if (quality.enableClouds && cloudsTexture) {
        const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.008, quality.cloudSegments, quality.cloudSegments);
        const cloudMaterial = new THREE.MeshPhongMaterial({
            map: cloudsTexture,
            transparent: true,
            opacity: state.isDaylight ? 0.3 : 0.1,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending
        });
        cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloudMesh.renderOrder = 0; // Render first
        scene.add(cloudMesh);
    }

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
    controls.dampingFactor = 0.3; // Increased for smoother damping
    controls.screenSpacePanning = false;
    controls.minDistance = 6;
    controls.maxDistance = 12;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    
    // Zoom settings for smoother zooming
    controls.zoomSpeed = 0.3; // Reduced zoom speed (default is 1.0)
    controls.enableZoom = true;
    controls.zoomDampingFactor = 0.1; // Smooth zoom damping

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
        
        // Create a simple sphere for the location marker
        const headGeometry = new THREE.SphereGeometry(0.015, quality.pinDetail, quality.pinDetail); // Smaller and less detailed sphere
        const headMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x4169E1,
            emissive: 0x0000ff,
            emissiveIntensity: 0.3,
            shininess: 50
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        
        // Create a subtle glow effect
        pinGroup.add(head);
        if (!lowPowerMode) {
            const glowGeometry = new THREE.SphereGeometry(0.04, quality.pinDetail, quality.pinDetail);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0x6495ED,
                transparent: true,
                opacity: 0.25
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            pinGroup.add(glow);
        }

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
    });

    // After creating earthMesh, add this:
    populateFilterDropdowns(flightRoutesData);

    // Extract flight path initialization into a separate function
    function initializeFlightPaths(routes, targetMesh) {
        const routeFrequencies = countRouteFrequencies(routes);
        const processedRoutes = new Set();
        
        // Get unique airlines and generate colors
        const uniqueAirlines = [...new Set(routes.map(route => route.airline))].filter(Boolean);
        const colors = generateDistinctColors(uniqueAirlines.length);
        const airlineColors = Object.fromEntries(
            uniqueAirlines.map((airline, index) => [airline, colors[index]])
        );
        // Add default color
        airlineColors['default'] = 0x00ff00;

        routes.forEach(route => {
            const cities = [route.origin, route.destination].sort();
            const routeKey = `${cities[0]}-${cities[1]}`;
            
            if (processedRoutes.has(routeKey)) return;
            processedRoutes.add(routeKey);
            
            const originLoc = findLocationByName(route.origin);
            const destLoc = findLocationByName(route.destination);
            
            if (!originLoc || !destLoc) {
                console.warn(`Skipping route: ${route.origin} -> ${route.destination} due to missing location data`);
                return;
            }

            const startPoint = latLonToVector3(originLoc.lat, originLoc.lon, earthRadius);
            const endPoint = latLonToVector3(destLoc.lat, destLoc.lon, earthRadius);
            
            const frequency = getRouteFrequency(route.origin, route.destination, routeFrequencies);
            const numLines = Math.min(Math.max(frequency, 1), quality.maxRouteLines);
            
            const pathsPoints = createFlightPath(startPoint, endPoint, earthRadius, numLines, quality.pathPoints);
            
            const flightLines = createFlightLines(
                pathsPoints, 
                airlineColors[route.airline] || airlineColors.default,
                quality.enableGlow
            );
            
            // Add lines directly to scene instead of as children of earthMesh
            flightLines.forEach(line => scene.add(line));
        });
    }

    // Initialize flight paths with all data
    initializeFlightPaths(flightRoutesData, earthMesh);

    function clearFlightLines() {
        for (let i = scene.children.length - 1; i >= 0; i -= 1) {
            const child = scene.children[i];
            if (child instanceof THREE.Line) {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                scene.remove(child);
            }
        }
    }

    // Setup filter handlers
    setupFilterHandlers(earthMesh, initializeFlightPaths, clearFlightLines, scene);

    // Initial Camera Position
    camera.position.set(4, 8, 8); // Position camera above and to the side of Europe
    camera.lookAt(0, 0, 0); // Look at the center of the Earth
    controls.update(); // Update controls after changing camera position

    // Animation Loop with cloud rotation
    let lastFrameTime = 0;
    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        if (now - lastFrameTime < 1000 / quality.frameRate) {
            return;
        }
        lastFrameTime = now;

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
    const loadingOverlay = document.getElementById('earth-loading');
    if (loadingOverlay) {
        loadingManager.onLoad = () => {
            setTimeout(() => loadingOverlay.classList.add('hidden'), 300);
            setTimeout(() => loadingOverlay.remove(), 800);
        };
    }

    animate();

    console.log("Three.js Earth initialized with enhanced visualization");
}
