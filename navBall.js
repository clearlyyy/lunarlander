import * as THREE from 'three';
import { texture } from 'three/tsl';
export default class NavBall {
    constructor(player, hudScene, radius = 80, texturePath = './assets/textures/navball.png') {
        this.player = player;
        this.radius = radius;
        this.hudScene = hudScene;
        // Navball sphere 
        const geo = new THREE.SphereGeometry(radius, 64, 64);
        const tex = new THREE.TextureLoader().load(texturePath);
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            toneMapped: false
        });

        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = this.renderer?.capabilities.getMaxAnisotropy() || 16;
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(0, -400, 0); // HUD position
        this.mesh.renderOrder = 999;
        this.mesh.frustumCulled = false;
        hudScene.add(this.mesh);
        
        // Prograde Marker 
        const markerGeo = new THREE.SphereGeometry(8, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.progradeMarker = new THREE.Mesh(markerGeo, markerMat);
        this.progradeMarker.renderOrder = 1000;
        this.progradeMarker.frustumCulled = false;
        this.mesh.add(this.progradeMarker);
        
        // Retrograde Marker
        const retroMarkerGeo = new THREE.SphereGeometry(8, 16, 16);
        const retroMarkerMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.retrogradeMarker = new THREE.Mesh(retroMarkerGeo, retroMarkerMat);
        this.retrogradeMarker.renderOrder = 1000;
        this.retrogradeMarker.frustumCulled = false;
        this.mesh.add(this.retrogradeMarker);
        
        // --- Center Cursor ---
        const cursorGeo = new THREE.PlaneGeometry(64, 64);
        const cursorTex = new THREE.TextureLoader().load('textures/nav_cursor.png');
        const cursorMat = new THREE.MeshBasicMaterial({
            map: cursorTex,
            transparent: true,
            depthTest: false
        });
        this.cursor = new THREE.Mesh(cursorGeo, cursorMat);
        this.cursor.position.set(0, 0, this.radius + 5);
        this.cursor.renderOrder = 1001;
        this.cursor.frustumCulled = false;
        hudScene.add(this.cursor);
    }
    update() {
        // Get player's position and orientation
        const playerPos = this.player.getPosition();
        const playerQuat = this.player.getQuaternion();
        
        // Calculate the local up vector 
        const moonCenter = new THREE.Vector3(0, 0, 0);
        const radialUp = playerPos.clone().sub(moonCenter).normalize();
        
        // Create a rotation that aligns world Y-axis with the radial up direction
        const worldUp = new THREE.Vector3(0, 1, 0);
        const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(worldUp, radialUp);
        
        // Apply texture correction to the player's quaternion BEFORE relative calculation
        const textureCorrection = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), 
            -Math.PI / 2
        );
        const correctedPlayerQuat = playerQuat.clone().multiply(textureCorrection);
        
        // The navball shows player orientation relative to the surface frame
        const relativeQuat = surfaceQuat.clone().invert().multiply(correctedPlayerQuat);
        
        // Invert it so the navball rotates opposite to the player
        this.mesh.quaternion.copy(relativeQuat.invert());
        
        this.updateProgradeMarker(surfaceQuat, correctedPlayerQuat);
        this.updateRetrogradeMarker(surfaceQuat, correctedPlayerQuat);
        
        // Keep cursor centered and facing camera
        this.cursor.position.copy(this.mesh.position);
        this.cursor.position.z += this.radius + 5;
    }
    
    updateProgradeMarker(surfaceQuat, correctedPlayerQuat) {
        // Get velocity in world space
        const velocity = this.player.getVelocity();
        
        if (velocity.length() < 0.1) {
            this.progradeMarker.visible = false;
            return;
        }
        
        this.progradeMarker.visible = true;
        
        // Transform velocity to surface-relative frame
        const surfaceVelocity = velocity.clone().applyQuaternion(surfaceQuat.clone().invert());
        
        const localVelocity = surfaceVelocity.clone();
        
        // Normalize and position on sphere surface
        localVelocity.normalize().multiplyScalar(this.radius + 4);
        
        this.progradeMarker.position.copy(localVelocity);
    }
    
    updateRetrogradeMarker(surfaceQuat, correctedPlayerQuat) {
        // Get velocity in world space
        const velocity = this.player.getVelocity();
        
        if (velocity.length() < 0.1) {
            this.retrogradeMarker.visible = false;
            return;
        }
        
        this.retrogradeMarker.visible = true;
        
        // Transform velocity to surface-relative frame
        const surfaceVelocity = velocity.clone().applyQuaternion(surfaceQuat.clone().invert());
        
        const localVelocity = surfaceVelocity.clone().negate();
        
        // Normalize and position on sphere surface
        localVelocity.normalize().multiplyScalar(this.radius + 4);
        
        this.retrogradeMarker.position.copy(localVelocity);
    }
}