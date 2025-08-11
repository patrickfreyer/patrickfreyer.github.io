# Earth AR Visualization

This project adds Apple ARKit support to the existing Three.js Earth visualization using the WebXR Device API.

## Features

- **AR Earth Placement**: Place a 3D Earth globe in your real environment
- **Flight Route Visualization**: View your flight routes in augmented reality
- **Touch Interaction**: Tap to place the Earth and interact with it
- **Cross-Platform**: Works on iOS devices with ARKit support

## How It Works

### WebXR Device API
The AR functionality uses the **WebXR Device API**, which is the web standard for AR/VR experiences. This allows the Three.js visualization to work with:

- **Apple ARKit** (iOS devices)
- **Google ARCore** (Android devices)
- **WebXR-compatible browsers**

### Key Components

1. **AR Session Management**: Handles the AR session lifecycle
2. **Hit Testing**: Detects surfaces for Earth placement
3. **Reticle System**: Visual indicator for placement location
4. **Simplified Earth Model**: Optimized for AR performance

## Browser Support

### iOS (Apple ARKit)
- **Safari**: Full support with ARKit
- **Chrome for iOS**: Limited support
- **Firefox for iOS**: Limited support

### Android (ARCore)
- **Chrome**: Full support with ARCore
- **Firefox**: Limited support

## Usage

### Basic AR Experience

1. Open `earth-ar.html` on a supported device
2. Allow camera permissions when prompted
3. Point your camera at a flat surface
4. Tap the screen to place the Earth
5. Explore your flight routes in AR space

### Integration with Existing Earth

To integrate AR with your existing Earth visualization:

```javascript
// In your existing earth.js file
import { EarthAR } from './earth-ar.js';

// After initializing your existing earth
const earthAR = new EarthAR();
await earthAR.init();

// Integrate with existing earth mesh
earthAR.integrateWithExistingEarth(existingEarthMesh);
```

## Technical Implementation

### AR Session Setup
```javascript
const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay']
});
```

### Hit Testing
```javascript
const hitTestSource = await session.requestHitTestSource({
    space: referenceSpace
});
```

### Rendering Loop
```javascript
renderer.setAnimationLoop((timestamp, frame) => {
    // AR rendering logic
    renderer.render(scene, camera);
});
```

## Performance Considerations

### AR Optimizations
- **Reduced Geometry**: Simplified Earth model for AR
- **Efficient Materials**: Basic materials instead of complex textures
- **Frame Rate**: Maintains 60fps for smooth AR experience
- **Memory Management**: Proper cleanup of AR resources

### Device Requirements
- **iOS 11+** with ARKit support
- **Modern browser** with WebXR support
- **A9 processor or newer** for optimal performance

## Troubleshooting

### Common Issues

1. **"AR Not Supported" Error**
   - Check if device supports ARKit/ARCore
   - Ensure browser supports WebXR
   - Try Safari on iOS for best compatibility

2. **Camera Permission Denied**
   - Allow camera access in browser settings
   - Refresh page and try again

3. **Poor Performance**
   - Close other AR apps
   - Ensure good lighting conditions
   - Restart browser if needed

### Debug Mode
Enable console logging for debugging:
```javascript
// In earth-ar.js
console.log('AR Session State:', this.isARSession);
console.log('Hit Test Results:', hitTestResults);
```

## Future Enhancements

### Planned Features
- **Gesture Controls**: Pinch to zoom, rotate Earth
- **Multiple Earths**: Place multiple globes
- **Flight Path Animation**: Animated flight routes
- **Voice Commands**: Voice-controlled interactions
- **Social Sharing**: Share AR experiences

### Advanced Integration
- **Real-time Data**: Live flight data in AR
- **Weather Overlay**: Real weather on Earth
- **Time Zones**: Dynamic day/night cycles
- **Custom Markers**: Personal location pins

## Development

### Local Development
1. Serve files over HTTPS (required for WebXR)
2. Use a local server: `python -m http.server 8000`
3. Access via `https://localhost:8000/earth-ar.html`

### Testing
- Test on physical iOS device (simulator doesn't support AR)
- Use Safari for best iOS compatibility
- Test various lighting conditions
- Verify performance on different devices

## Resources

- [WebXR Device API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
- [Three.js WebXR Examples](https://threejs.org/docs/#examples/en/webxr/AR_handling_and_displaying_a_model)
- [Apple ARKit Documentation](https://developer.apple.com/augmented-reality/)
- [WebXR Polyfill](https://github.com/immersive-web/webxr-polyfill) for broader compatibility

## License

This AR implementation is part of the existing project and follows the same licensing terms. 