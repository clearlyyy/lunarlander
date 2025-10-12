import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';

const SCALE = 1 / 4;

export default class TileManager {
    constructor(scene, physics, camera, renderer, isInMainMenuFunc) {
        this.scene = scene;
        this.physics = physics;
        this.camera = camera;
        this.renderer = renderer;
        this.tilesRenderer = null;

        // Ammo objects for cleanup
        this.currentCollisionBody = null;
        this.currentCollisionMesh = null;
        this.currentCollisionShape = null;
        this.currentCollisionTriangleMesh = null;
        this.currentTile = null;
        this.isInMainMenuFunc = isInMainMenuFunc;
    }

    async init() {
        const assetId = 2684829;
        const accessToken = import.meta.env.VITE_ACCESS_TOKEN;
        const url = new URL(`https://api.cesium.com/v1/assets/${assetId}/endpoint`);
        url.searchParams.append('access_token', accessToken);

        const res = await fetch(url, { mode: 'cors' });
        const json = await res.json();
        const endpointUrl = new URL(json.url);
        const version = endpointUrl.searchParams.get('v');

        this.tilesRenderer = new TilesRenderer(endpointUrl);
        this.tilesRenderer.fetchOptions = { headers: { Authorization: `Bearer ${json.accessToken}` } };
        this.tilesRenderer.preprocessURL = (uri) => {
            uri = new URL(uri);
            uri.searchParams.set('v', version);
            return uri.toString();
        };
        this.tilesRenderer.setCamera(this.camera);
        this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
        this.tilesRenderer.group.scale.set(SCALE, SCALE, SCALE);

        const loader = new THREE.TextureLoader();
        this.detailNormal = loader.load('textures/moon_01_nor_gl_4k.jpg');
        this.detailNormal.wrapS = this.detailNormal.wrapT = THREE.RepeatWrapping;
        this.detailNormal.repeat.set(20, 20);

        this.tilesRenderer.addEventListener('load-model', ({ scene: tileScene }) => {
            tileScene.traverse((c) => {
                if (c.isMesh && c.material) {
                    const oldMat = c.material;
  
                    const useDetailMap = !this.isInMainMenuFunc();
                
                    c.material = new THREE.MeshStandardMaterial({
                        map: oldMat.map || null,
                        normalMap: useDetailMap ? this.detailNormal : null,
                        roughnessMap: oldMat.roughnessMap || null,
                        metalnessMap: oldMat.metalnessMap || null,
                    });
                
                    c.material.needsUpdate = true;
                    c.castShadow = true;
                    c.receiveShadow = true;
                    c.geometry.computeVertexNormals();
                    oldMat.dispose();
                }
            });
        });

        this.tilesRenderer.addEventListener('load-tileset', () => {
            const sphere = new THREE.Sphere();
            this.tilesRenderer.getBoundingSphere(sphere);
            this.tilesRenderer.group.position.copy(sphere.center).negate();
        });

        this.scene.add(this.tilesRenderer.group);
    }

    update() {
        if (this.tilesRenderer) this.tilesRenderer.update();
    }

    generateCollision(apolloMesh, AmmoLib) {
        if (!this.tilesRenderer || !apolloMesh) return;

        const tile = this._findClosestTile(apolloMesh);
        if (!tile || tile === this.currentTile) return;

        // Cleanup old collision objects 
        if (this.currentCollisionBody) {
            this.physics.removeBody(this.currentCollisionBody);
            AmmoLib.destroy(this.currentCollisionBody.getMotionState());
            AmmoLib.destroy(this.currentCollisionBody);
            this.currentCollisionBody = null;
        }
        if (this.currentCollisionShape) {
            AmmoLib.destroy(this.currentCollisionShape);
            this.currentCollisionShape = null;
        }
        if (this.currentCollisionTriangleMesh) {
            AmmoLib.destroy(this.currentCollisionTriangleMesh);
            this.currentCollisionTriangleMesh = null;
        }
        if (this.currentCollisionMesh) {
            this.scene.remove(this.currentCollisionMesh);
            this.currentCollisionMesh.geometry.dispose();
            this.currentCollisionMesh.material.dispose();
            this.currentCollisionMesh = null;
        }

        this.currentTile = tile;

        // Get tile transform ---
        const tilePos = new THREE.Vector3();
        const tileQuat = new THREE.Quaternion();
        const tileScale = new THREE.Vector3();
        tile.matrixWorld.decompose(tilePos, tileQuat, tileScale);

        // Clone and transform geometry 
        const geometry = tile.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(0, 0, 0), tileQuat, tileScale
        ));

        // Create Ammo collision shape 
        const { shape, triangleMesh } = this._convertMeshToShape(geometry, AmmoLib);
        this.currentCollisionShape = shape;
        this.currentCollisionTriangleMesh = triangleMesh;

        // Create rigid body 
        const transform = new AmmoLib.btTransform();
        transform.setIdentity();
        transform.setOrigin(new AmmoLib.btVector3(tilePos.x, tilePos.y, tilePos.z));

        const motionState = new AmmoLib.btDefaultMotionState(transform);
        this.currentCollisionBody = new AmmoLib.btRigidBody(
            new AmmoLib.btRigidBodyConstructionInfo(0, motionState, shape, new AmmoLib.btVector3(0, 0, 0))
        );

        this.physics.addBody(this.currentCollisionBody);

        // Debug wireframe mesh UNCOMMENT THIS BLOCK TO SEE WIREFRAME VISUAL OF THE COLLISION MESH!
        //this.currentCollisionMesh = new THREE.Mesh(
        //    geometry.clone(),
        //    new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 })
        //);
        //this.currentCollisionMesh.position.copy(tilePos);
        //this.currentCollisionMesh.quaternion.copy(tileQuat);
        //this.scene.add(this.currentCollisionMesh);
    }

    _findClosestTile(apolloMesh) {
        const playerPos = apolloMesh.position;
        let closestTile = null;
        let closestDistance = Infinity;

        this.tilesRenderer.group.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const tileCenter = new THREE.Vector3();
                child.getWorldPosition(tileCenter);
                const distance = playerPos.distanceTo(tileCenter);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTile = child;
                }
            }
        });

        return closestTile;
    }

    _convertMeshToShape(geometry, AmmoLib) {
        const vertices = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;
        const triangleMesh = new AmmoLib.btTriangleMesh();

        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const v0 = new AmmoLib.btVector3(vertices[indices[i] * 3], vertices[indices[i] * 3 + 1], vertices[indices[i] * 3 + 2]);
                const v1 = new AmmoLib.btVector3(vertices[indices[i + 1] * 3], vertices[indices[i + 1] * 3 + 1], vertices[indices[i + 1] * 3 + 2]);
                const v2 = new AmmoLib.btVector3(vertices[indices[i + 2] * 3], vertices[indices[i + 2] * 3 + 1], vertices[indices[i + 2] * 3 + 2]);
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
    
}