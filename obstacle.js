import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Ammo from 'ammo.js';

export default class Obstacle {
    constructor(position, scene, camera, renderer, physicsWorld, quaternion = null, type = 'ring', isEditor = false) {

        if (type === 'ring') {
            this.modelPath = "./assets/models/truss_ring.glb";
            this.colliderPath = "./assets/models/truss_ring_collider.glb";
        }
        if (type === 'box') {
            this.modelPath = "./assets/models/truss_box.glb";
            this.colliderPath = "./assets/models/truss_box_collider.glb";
        }

        this.number = 0;

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.physicsWorld = physicsWorld;
        this.position = position;
        this.type = type;
        this.isEditor = isEditor;
        this.mesh = null;
        this.body = null;

        this.loadModel(quaternion);
        
        
    }

    // there is a lot of bullshit that makes no sense, just dont touch it, it works, the slighest change will fuck this up 
    async loadModel(quaternion) {
        try {
            const loader = new GLTFLoader();

            // --- Load main glTF model ---
            const gltf = await loader.loadAsync(this.modelPath);
            this.mesh = gltf.scene;
            this.mesh.position.copy(this.position);
            this.mesh.scale.set(5, 5, 5);
            if (quaternion) this.mesh.quaternion.copy(quaternion);

            // Metallic material for main model
            const metalMaterial = new THREE.MeshStandardMaterial({
                color: 0xaaaaaa,
                metalness: 1.0,
                roughness: 0.1,
                envMapIntensity: 1.0,
            });

            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.material = metalMaterial;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.originalQuaternion = this.mesh.quaternion.clone();

            this.scene.add(this.mesh);

            // --- Create the visual mesh ---
            this._createVisualMesh();

            // --- Load collider model ---
            const colliderGltf = await loader.loadAsync(this.colliderPath);
            let colliderMesh = null;
            colliderGltf.scene.traverse(child => {
                if (child.isMesh && !colliderMesh) colliderMesh = child;
            });
            if (!colliderMesh) throw new Error("No mesh found in collider model");

            colliderMesh.position.copy(this.mesh.position);
            if (quaternion) colliderMesh.quaternion.copy(quaternion);
            colliderMesh.scale.copy(this.mesh.scale);

            const { shape } = this._convertMeshToShape(colliderMesh.geometry, Ammo);

            const scaling = new Ammo.btVector3(colliderMesh.scale.x, colliderMesh.scale.y, colliderMesh.scale.z);
            shape.setLocalScaling(scaling);
            Ammo.destroy(scaling);

            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(this.position.x, this.position.y, this.position.z));

            const quatAmmo = new Ammo.btQuaternion(this.mesh.quaternion.x, this.mesh.quaternion.y, this.mesh.quaternion.z, this.mesh.quaternion.w);
            transform.setRotation(quatAmmo);

            const motionState = new Ammo.btDefaultMotionState(transform);
            const mass = 0;
            const localInertia = new Ammo.btVector3(0, 0, 0);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);

            this.body = new Ammo.btRigidBody(rbInfo);
            if (this.physicsWorld.addBody) this.physicsWorld.addBody(this.body);
            else this.physicsWorld.addBody(this.body);

            console.log(`Obstacle Created: ${this.type}, ${this.number}`);
            console.log(`[Obstacle] Collider ready for type=${this.type}`);
        } catch (e) {
            console.error(`Failed to load model or collider:`, e);
        }
    }

    reset() {
    // Reset mesh position/rotation
    if (this.mesh) {
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.originalQuaternion);
        this.mesh.updateMatrixWorld();
    }

    // Reset physics
    if (this.body) {
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(this.position.x, this.position.y, this.position.z));

        const quatAmmo = new Ammo.btQuaternion(
            this.originalQuaternion.x,
            this.originalQuaternion.y,
            this.originalQuaternion.z,
            this.originalQuaternion.w
        );
        transform.setRotation(quatAmmo);

        this.body.setWorldTransform(transform);
        this.body.getMotionState().setWorldTransform(transform);
        this.body.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
        this.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
    }

    // Recreate visual mesh if removed
    if (!this.visualMesh) this._createVisualMesh();
}



 

    _convertMeshToShape(geometry, AmmoLib) {
        const vertices = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;
        const triangleMesh = new AmmoLib.btTriangleMesh();

        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const v0 = new AmmoLib.btVector3(
                    vertices[indices[i] * 3],
                    vertices[indices[i] * 3 + 1],
                    vertices[indices[i] * 3 + 2]
                );
                const v1 = new AmmoLib.btVector3(
                    vertices[indices[i + 1] * 3],
                    vertices[indices[i + 1] * 3 + 1],
                    vertices[indices[i + 1] * 3 + 2]
                );
                const v2 = new AmmoLib.btVector3(
                    vertices[indices[i + 2] * 3],
                    vertices[indices[i + 2] * 3 + 1],
                    vertices[indices[i + 2] * 3 + 2]
                );
                triangleMesh.addTriangle(v0, v1, v2, true);
                AmmoLib.destroy(v0);
                AmmoLib.destroy(v1);
                AmmoLib.destroy(v2);
            }
        } else {
            for (let i = 0; i < vertices.length; i += 9) {
                const v0 = new AmmoLib.btVector3(vertices[i], vertices[i + 1], vertices[i + 2]);
                const v1 = new AmmoLib.btVector3(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
                const v2 = new AmmoLib.btVector3(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
                triangleMesh.addTriangle(v0, v1, v2, true);
                AmmoLib.destroy(v0);
                AmmoLib.destroy(v1);
                AmmoLib.destroy(v2);
            }
        }

        const shape = new AmmoLib.btBvhTriangleMeshShape(triangleMesh, true, true);
        return { shape, triangleMesh };
    }

    _createVisualMesh() {
        if (!this.mesh || this.isEditor) return;

        let geom;
        let gradientAxis = 'y'; 
        if (this.type === 'ring') {
            geom = new THREE.CylinderGeometry(19, 19, 2, 64, 1, false);
            gradientAxis = 'z'; 
        } else if (this.type === 'box') {
            geom = new THREE.BoxGeometry(19, 19, 1);
        }

        geom.computeBoundingBox();
        const minVal = geom.boundingBox[`min`][gradientAxis];
        const maxVal = geom.boundingBox[`max`][gradientAxis];

        const shaderMat = new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            uniforms: {
                time: { value: 0 },
                color1: { value: new THREE.Color(0x0285f0) },
                color2: { value: new THREE.Color(0x020275) },
                minVal: { value: minVal },
                maxVal: { value: maxVal },
                speed: { value: 0.5 }
            },
            vertexShader: `
                varying float vPos;
                uniform float minVal;
                uniform float maxVal;
                void main() {
                    ${gradientAxis === 'y' ? 'vPos = (position.y - minVal) / (maxVal - minVal);' : ''}
                    ${gradientAxis === 'z' ? 'vPos = (position.z - minVal) / (maxVal - minVal);' : ''}
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float speed;
                varying float vPos;
                void main() {
                    float t = vPos + time * speed;
                    float gradient = 0.5 + 0.5 * sin(t * 3.14159);
                    vec3 col = mix(color1, color2, gradient);
                    float alpha = gradient * 0.1;
                    gl_FragColor = vec4(col, alpha);
                }
            `
        });

        this.visualMesh = new THREE.Mesh(geom, shaderMat);
        this.visualMesh.position.copy(this.mesh.position);
        this.visualMesh.scale.copy(this.mesh.scale);

        if (this.type === 'ring') {
            // Only apply extra rotation to the ring
            const rotQuat = new THREE.Quaternion();
            rotQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
            this.visualMesh.quaternion.copy(this.originalQuaternion).multiply(rotQuat);
        } else {
            // Box: copy mesh rotation directly
            this.visualMesh.quaternion.copy(this.originalQuaternion);
        }

        this.scene.add(this.visualMesh);
    }


    removeVisualMesh() {
        if (this.visualMesh) {
            console.log("Removing visualMesh of type", this.type); 
            this.scene.remove(this.visualMesh);
            if (this.visualMesh.geometry) this.visualMesh.geometry.dispose();
            if (Array.isArray(this.visualMesh.material)) {
                this.visualMesh.material.forEach(mat => mat.dispose());
            } else if (this.visualMesh.material) {
                this.visualMesh.material.dispose();
            }
            this.visualMesh = null;
        }
    } 
}


