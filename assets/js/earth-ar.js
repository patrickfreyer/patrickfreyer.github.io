import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { ARButton } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/webxr/ARButton.js';

// WebXR Polyfill for better iOS support
let WebXRPolyfill = null;
try {
    WebXRPolyfill = await import('https://cdn.jsdelivr.net/npm/webxr-polyfill@latest/build/webxr-polyfill.min.js');
} catch (e) {
    console.log('WebXR Polyfill not available, continuing without it');
}

class EarthAR {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.earthMesh = null;
        this.isARSession = false;
        this.reticle = null;
        this.earthScale = 0.3; // Smaller scale for AR
    }

    async init() {
        // Initialize WebXR Polyfill if available
        if (WebXRPolyfill && !navigator.xr) {
            new WebXRPolyfill();
            console.log('WebXR Polyfill initialized');
        }

        // Wait a bit for polyfill to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if WebXR is supported
        if (!navigator.xr) {
            console.warn('WebXR not supported - trying alternative detection');
            
            // Alternative detection for iOS Safari
            if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
                console.log('iOS device detected, attempting AR setup');
                return this.setupForIOS();
            }
            
            return false;
        }

        // Check if AR is supported
        try {
            const isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!isARSupported) {
                console.warn('AR not supported on this device');
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking AR support:', error);
            return false;
        }
    }

    async setupForIOS() {
        // iOS Safari specific setup
        console.log('Setting up for iOS Safari');
        
        // Check for iOS version and Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (isIOS && isSafari) {
            console.log('iOS Safari detected, AR should be available');
            return true;
        }
        
        return false;
    }

    createARScene() {
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ 
            alpha: true, 
            antialias: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true;
        
        // Add to DOM
        document.body.appendChild(this.renderer.domElement);
        
        // Add AR button
        const arButton = ARButton.createButton(this.renderer, {
            sessionInit: {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.body }
            }
        });
        document.body.appendChild(arButton);
        
        // Setup lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 10, 0);
        this.scene.add(directionalLight);
        
        // Create reticle for placement
        this.createReticle();
        
        // Setup session events
        this.renderer.xr.addEventListener('sessionstart', () => {
            this.isARSession = true;
            console.log('AR session started');
        });
        
        this.renderer.xr.addEventListener('sessionend', () => {
            this.isARSession = false;
            console.log('AR session ended');
        });
        
        // Start render loop
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    createReticle() {
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial();
        this.reticle = new THREE.Mesh(geometry, material);
        this.reticle.matrixAutoUpdate = false;
        this.reticle.visible = false;
        this.scene.add(this.reticle);
    }

    createEarthForAR() {
        // Create a simplified earth for AR
        const earthRadius = this.earthScale;
        const geometry = new THREE.SphereGeometry(earthRadius, 32, 32);
        
        // Simple material for AR (no complex textures)
        const material = new THREE.MeshPhongMaterial({
            color: 0x4B6CB7, // Blue color
            shininess: 30
        });
        
        this.earthMesh = new THREE.Mesh(geometry, material);
        this.earthMesh.visible = false;
        this.scene.add(this.earthMesh);
        
        // Add some basic flight paths for AR
        this.addSimpleFlightPaths();
    }

    addSimpleFlightPaths() {
        // Create simple curved paths for AR
        const curve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(-0.5, 0, 0),
            new THREE.Vector3(-0.2, 0.3, 0.2),
            new THREE.Vector3(0.2, 0.3, -0.2),
            new THREE.Vector3(0.5, 0, 0)
        );
        
        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xFFFF00 });
        const line = new THREE.Line(geometry, material);
        
        this.earthMesh.add(line);
    }

    setupHitTesting() {
        let hitTestSource = null;
        let hitTestSourceRequested = false;

        const session = this.renderer.xr.getSession();
        
        session.addEventListener('select', () => {
            if (this.reticle.visible) {
                // Place earth at reticle position
                this.earthMesh.position.setFromMatrixPosition(this.reticle.matrix);
                this.earthMesh.visible = true;
                this.reticle.visible = false;
            }
        });

        session.requestReferenceSpace('viewer').then((referenceSpace) => {
            session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                hitTestSource = source;
            });
        });

        session.addEventListener('end', () => {
            hitTestSourceRequested = false;
            hitTestSource = null;
        });

        const frame = this.renderer.xr.getFrame();
        
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSourceRequested === false) return;

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            
            if (hitTestResults.length) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(this.reticle.parent);
                
                this.reticle.visible = true;
                this.reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                this.reticle.visible = false;
            }
        }
    }

    render() {
        if (this.isARSession) {
            this.setupHitTesting();
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    // Method to integrate with existing earth visualization
    integrateWithExistingEarth(existingEarthMesh) {
        if (this.earthMesh && existingEarthMesh) {
            // Clone the existing earth and scale it for AR
            this.earthMesh = existingEarthMesh.clone();
            this.earthMesh.scale.setScalar(this.earthScale);
            this.earthMesh.visible = false;
            this.scene.add(this.earthMesh);
        }
    }
}

// Export for use
window.EarthAR = EarthAR; 