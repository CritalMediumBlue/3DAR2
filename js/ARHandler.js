import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

export class ARHandler {
  constructor(renderer, scene, cellGroup) {
    this.renderer = renderer;
    this.scene = scene;
    this.cellGroup = cellGroup;
    
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.modelPlaced = false;
    
    this.setupAR();
  }
  
  setupAR() {
    // Create AR button
    const arButton = ARButton.createButton(this.renderer, {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    
    document.body.appendChild(arButton);
    
    // Create reticle for AR placement
    const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true, 
      opacity: 0.3, 
      side: THREE.DoubleSide
    });
    
    this.reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
  
    // Set up controller for AR interaction
    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener('select', this.onSelect.bind(this));
    this.scene.add(this.controller);
    
    // Listen for session start/end
    this.renderer.xr.addEventListener('sessionstart', () => {
      if (this.onSessionStart) this.onSessionStart();
    });
    
    this.renderer.xr.addEventListener('sessionend', () => {
      this.modelPlaced = false;
      this.hitTestSourceRequested = false;
      this.hitTestSource = null;
      
      // Reset the cell group visibility and position
      this.cellGroup.visible = true;
      
      if (this.onSessionEnd) this.onSessionEnd();
    });
  }
  
  onSelect() {
    if (this.reticle.visible && !this.modelPlaced) {
      // Place the cell group at the reticle position
      this.cellGroup.position.setFromMatrixPosition(this.reticle.matrix);
      
      this.cellGroup.scale.set(0.05, 0.05, 0.05);
      this.reticle.visible = false;
      this.cellGroup.visible = true;
      this.modelPlaced = true;
      this.cellGroup.position.y += 0.8; // Offset to avoid clipping with the ground
      
      if (this.onModelPlaced) this.onModelPlaced();
    }
  }
  
  handleHitTest() {
    if (!this.hitTestSourceRequested) {
      const session = this.renderer.xr.getSession();
      
      if (session) {
        session.requestReferenceSpace('viewer').then((referenceSpace) => {
          session.requestHitTestSource({ space: referenceSpace }).then((source) => {
            this.hitTestSource = source;
          });
        });
        
        session.addEventListener('end', () => {
          this.hitTestSourceRequested = false;
          this.hitTestSource = null;
        });
        
        this.hitTestSourceRequested = true;
      }
    }
    
    if (this.hitTestSource) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const frame = this.renderer.xr.getFrame();
      
      if (frame) {
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        
        if (hitTestResults.length && !this.modelPlaced) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          
          if (pose) {
            this.reticle.visible = true;
            this.reticle.matrix.fromArray(pose.transform.matrix);
          }
        } else {
          this.reticle.visible = false;
        }
      }
    }
  }
}
