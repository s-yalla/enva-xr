import {Vector2, WebGLRenderer, Scene, PerspectiveCamera, PCFSoftShadowMap, Object3D} from "three";
import {XRManager} from "./utils/XRManager";
import { ARObject } from "object/ARObject";

/**
 * Configuration of the AR renderer.
 * 
 * Indicates the capabilities required by the renderer.
 */
class ARRendererConfig {
	/**
	 * Hit test allow the user to ray cast into real-wolrd depth data.
	 * 
	 * Useful for interaction, object placement, etc. 
	 */
	public hitTest: boolean = true;

	/**
	 * Lighting probe allow the system to check environment ligthing.
	 * 
	 * Tracks the intensity direction and color of the main light source.
	 */
	public lightProbe: boolean = true;

	/**
	 * Depth information captured from the environment.
	 */
	public depth: boolean = true;
}

/**
 * AR renderer is responsible for rendering the scene in AR environment.
 * 
 * The scene and internal WebGL renderer are managed by the AR renderer.
 * 
 * The renderer handles the render loop execution.
 */
export class ARRenderer
{
	/**
	 * Configuration of the AR renderer.
	 */
	public config: ARRendererConfig = new ARRendererConfig();

	/**
	 * Camera used to view the this.scene.
	 */
	public camera: PerspectiveCamera = new PerspectiveCamera(60, 1, 1e-1, 1e3);

	/**
	 * Scene to draw into the screen.
	 */
	public scene: Scene = new Scene();

	/**
	 * WebGL this.renderer used to draw the this.scene.
	 */
	public renderer: WebGLRenderer = null;

	/**
	 * Size of the this.rendererer.
	 */
	public resolution: Vector2 = new Vector2();

	/**
	 * WebGL 2.0 context used to render.
	 */
	public glContext: WebGLRenderingContext = null;

	/**
	 * XR session data.
	 */
	public xrSession: XRSession = null;

	/**
	 * XR Binding object used get additional gl data.
	 */
	public xrGlBinding: XRWebGLBinding = null;

	/**
	 * XR reference space indicates the reference for tracking in the XR environment.
	 */
	public xrReferenceSpace: XRReferenceSpace = null;

	/**
	 * XR viewer pose indiactes the pose of the user or device tracked by the XR system.
	 * 
	 * It may represent a tracked piece of hardware or the observed position of a user head relative.
	 * 
	 * Updated every frame based on tracking.
	 */
	public xrViewerPose: XRViewerPose = null;

	/**
	 * XR hit test source.
	 * 
	 * Hit test allow the user to ray cast into real-wolrd depth data.
	 * 
	 * Available when config.hitTest is set true.
	 */
	public xrHitTestSource: XRHitTestSource = null;

	/**
	 * Lighting probe allow the system to check environment ligthing.
	 * 
	 * Tracks the intensity direction and color of the main light source.
	 * 
	 * Available when config.lightProbe is set true.
	 */
	public xrLightProbe: any = null;

	/**
	 * Callback to update logic of the app before rendering.
	 */
	public onFrame:(time: number, renderer: ARRenderer) => void = null;

	/**
	 * Rendering canvas.
	 */
	public canvas = null;

	/**
	 * DOM container for GUI elements visible in AR mode.
	 */
	public domContainer = document.createElement("div");

	public constructor()
	{
		if (window.isSecureContext === false)
		{
			throw new Error("WebXR is not available trough HTTP.");
		}

		this.domContainer.style.position = "absolute";
		this.domContainer.style.top = "0px";
		this.domContainer.style.left = "0px";
		this.domContainer.style.width = "100%";
		this.domContainer.style.height = "100%";

		this.setupRenderer();
	}

	/**
	 * Initalize the AR app.
	 */
	public async start(): Promise<void>
	{
		this.resolution.set(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.domContainer);

		// Resize this.renderer
		window.addEventListener("resize", () => {this.resize();}, false);

		await XRManager.start(this.renderer,
		{
			optionalFeatures: ["dom-overlay"],
			domOverlay: {root: this.domContainer},
			requiredFeatures: ["depth-sensing", "hit-test", "light-estimation"],
			depthSensing: {
				usagePreference: ["cpu-optimized", "gpu-optimized"],
				dataFormatPreference: ["luminance-alpha", "float32"],
			},
		});

		// Render loop
		this.renderer.setAnimationLoop((time: number, frame: any) =>
		{
			this.render(time, frame);
		});
	}

	/**
	 * Dispose renderer, should be called when the renderer is not longer necessary.
	 */
	public dispose(): void {
		this.forceContextLoss();
		this.renderer.setAnimationLoop(null);
	}

	/**
	 * Change the shadow map rendering method.
	 * 
	 * @param shadowType - Type of shadows to use.
	 */
	public setShadowType(shadowType: number): void
	{
		this.renderer.shadowMap.enabled = shadowType !== null;
		this.renderer.shadowMap.type = shadowType;
		this.renderer.shadowMap.needsUpdate = true;

		// Update materials
		this.scene.traverse(function(child: Object3D)
		{
			// @ts-ignore
			if (child.material)
			{
				// @ts-ignore
				child.material.needsUpdate = true;
			}
		});

		console.log("enva-xr: Shadow type changed to " + this.renderer.shadowMap.type);
	}

	/**
	 * Create and setup webglrenderer.
	 * 
	 * Creates a webgl2 renderer with XR compatibility enabled.
	 * 
	 * If the canvas
	 *
	 * @param canvas - Optional param with canvas to be used for rendering.
	 */
	public setupRenderer(canvas?: HTMLCanvasElement | OffscreenCanvas): void
	{
		if (canvas) {
			this.canvas = canvas;
		} else {
			this.canvas = document.createElement("canvas");
			document.body.appendChild(this.canvas);
		}

		this.glContext = this.canvas.getContext("webgl2", {xrCompatible: true});

		this.renderer = new WebGLRenderer(
			{
				context: this.glContext,
				antialias: true,
				alpha: true,
				canvas: this.canvas,
				depth: true,
				powerPreference: "high-performance",
				precision: "highp",
				preserveDrawingBuffer: false,
				premultipliedAlpha: true,
				logarithmicDepthBuffer: false,
				stencil: true
			});

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = PCFSoftShadowMap;

		this.renderer.sortObjects = false;
		this.renderer.physicallyCorrectLights = true;

		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.xr.enabled = true;
	}

	/**
	 * Force the loss of webgl rendering context.
	 * 
	 * To ensure that all webgl resources are dealocatted and the context destroyed.
	 */
	public forceContextLoss(): void
	{
		try
		{
			if (this.renderer)
			{
				this.renderer.dispose();
				this.renderer.forceContextLoss();
				this.renderer = null;
			}
		}
		catch (e)
		{
			this.renderer = null;
			throw new Error("Failed to destroy WebGL context.");
		}

		// Remove canvas from DOM
		if (this.canvas)
		{
			this.canvas.parent.removeChild(this.canvas);
		}
	};


	/**
	 * Update the canvas and renderer size based on window size.
	 */
	public resize(): void
	{
		this.resolution.set(window.innerWidth, window.innerHeight);

		this.camera.aspect = this.resolution.x / this.resolution.y;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize(this.resolution.x, this.resolution.y);
		this.renderer.setPixelRatio(window.devicePixelRatio);
	}


	/**
	 * Update logic and render this.scene into the screen.
	 *
	 * @param time - Time ellapsed since the beginning.
	 * @param frame - XR frame object.
	 */
	public async render(time: number, frame: XRFrame): Promise<void>
	{
		if (!frame)
		{
			return;
		}

		if (!this.xrSession) {
			this.xrSession = this.renderer.xr.getSession();
			this.xrSession.addEventListener("end", () =>
			{
				this.xrHitTestSource = null;
			});

			this.xrReferenceSpace = this.renderer.xr.getReferenceSpace();

			this.xrGlBinding = new XRWebGLBinding(this.xrSession, this.glContext);
		}
	
		// Hit test source
		if (this.config.hitTest && !this.xrHitTestSource)
		{
			this.xrHitTestSource = await this.xrSession.requestHitTestSource({space: this.xrReferenceSpace});

			console.log('enva-xr: XR hit test source', this.xrHitTestSource);
		}

		// Light probe
		if (this.config.lightProbe && !this.xrLightProbe) {
			// @ts-ignore
			this.xrLightProbe = await this.xrSession.requestLightProbe();
			this.xrLightProbe.addEventListener("reflectionchange", () => {
				// let glCubeMap = this.xrGlBinding.getReflectionCubeMap(this.xrLightProbe);
				// console.log(glCubeMap);
			});

			console.log('enva-xr: XR light probe', this.xrLightProbe);
		}

		// Update viewer pose
		this.xrViewerPose = frame.getViewerPose(this.xrReferenceSpace);
		if (this.xrViewerPose)
		{
			for (let view of this.xrViewerPose.views)
			{
				// @ts-ignore
				let depthInfo = frame.getDepthInformation(view);
				if (depthInfo)
				{
					// TODO <ADD CODE HERE>
				}
			}
		}

		// Update AR objects
		this.scene.traverse(function(object: Object3D): void {
			const ar = object as any as ARObject; 
			if (ar.isARObject) {
				ar.beforeARUpdate(this, time, frame);
			}
		});

		// onFrame callback
		if(this.onFrame) {
			this.onFrame(time, this);
		}
		
		this.renderer.render(this.scene, this.camera);
	}
}