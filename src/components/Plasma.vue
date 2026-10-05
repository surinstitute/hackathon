<!--
Adapted from https://vue-bits.dev/backgrounds/plasma
MIT + Commons Clause License Condition v1.0
Copyright (c) 2025 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software as part of
an application, website, or product, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
You may use this Software, including for any commercial purpose, so long as
you do not sell, sublicense, or redistribute the components themselves,
whether alone, in a bundle, template, or as a ported version.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
-->
<script setup lang="ts">
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

const props = withDefaults(defineProps<{
	colorToken?: `--${string}`;
	speed?: number;
	opacity?: number;
	scale?: number;
	mouseInteractive?: boolean;
}>(), {
	colorToken: '--accent-color',
	speed: 0.45,
	opacity: 0.25,
	scale: 1,
	mouseInteractive: false,
});

const containerRef = useTemplateRef<HTMLDivElement>('container');
let cleanup: (() => void) | undefined;

const vertex = `#version 300 es
precision highp float;
in vec2 position;
void main() {
	gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void main() {
	vec2 center = iResolution * 0.5;
	vec2 C = (gl_FragCoord.xy - center) / uScale + center;
	C += (uMouse - center) * 0.0002 * length(C - center) * uMouseInteractive;
	float d = 0.0, z = 0.0, T = iTime * uSpeed;
	vec3 O = vec3(0.0), p, S;
	vec4 o = vec4(0.0);
	for (int i = 0; i < 40; i++) {
		p = z * normalize(vec3(C - center, iResolution.y));
		p.z -= 4.0;
		S = p;
		d = p.y - T;
		p.x += 0.4 * (1.0 + p.y) * sin(d + p.x * 0.1) * cos(0.34 * d + p.x * 0.05);
		p.xz *= mat2(cos(p.y + vec4(0, 11, 33, 0) - T));
		vec2 Q = p.xz;
		d = (abs(sqrt(length(Q * Q)) - 0.25 * (5.0 + S.y)) / 3.0 + 8e-4) * 1.5;
		z += d;
		o = 1.0 + sin(S.y + p.z * 0.5 + S.z - length(S - p) + vec4(2, 1, 0, 8));
		O += o.w / d * o.xyz;
	}
	vec3 rgb = tanh(O / 1e4);
	float alpha = clamp(length(rgb) * uOpacity, 0.0, 1.0);
	fragColor = vec4(uColor * alpha, alpha);
}`;

onMounted(() => {
	const container = containerRef.value;
	if (!container) throw new Error('Plasma container is missing.');

	const color = getComputedStyle(container).getPropertyValue(props.colorToken).trim();
	const match = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
	if (!match) throw new Error(`Plasma requires a six-digit hex color in ${props.colorToken}.`);
	const rgb = match.slice(1).map((channel) => parseInt(channel, 16) / 255);

	const canvas = document.createElement('canvas');
	const context = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
	if (!context) {
		console.warn('Plasma: WebGL2 is unavailable; the hero retains its static image and gradient.');
		return;
	}

	const renderer = new Renderer({
		canvas,
		webgl: 2,
		alpha: true,
		antialias: false,
		premultipliedAlpha: true,
		dpr: Math.min(window.devicePixelRatio || 1, 1.5),
	});
	const gl = renderer.gl;
	const geometry = new Triangle(gl);
	const uniforms = {
		iTime: { value: 0 },
		iResolution: { value: new Float32Array([1, 1]) },
		uColor: { value: new Float32Array(rgb) },
		uSpeed: { value: props.speed * 0.4 },
		uScale: { value: props.scale },
		uOpacity: { value: props.opacity },
		uMouse: { value: new Float32Array([0, 0]) },
		uMouseInteractive: { value: props.mouseInteractive ? 1 : 0 },
	};
	const program = new Program(gl, { vertex, fragment, uniforms });
	const mesh = new Mesh(gl, { geometry, program });
	container.appendChild(canvas);

	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	let frame = 0;
	let resizeFrame = 0;
	let visible = false;
	let contextLost = false;
	let lastTime = 0;
	let elapsed = 0;
	let pointer: { x: number; y: number } | undefined;
	const pointerTarget = container.closest<HTMLElement>('.hero') ?? container;

	const handlePointerMove = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse' || motion.matches) return;
		const rect = container.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		pointer = {
			x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
			y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)),
		};
	};
	const handlePointerLeave = () => {
		pointer = undefined;
	};

	const render = () => {
		uniforms.uMouse.value.set([
			(pointer?.x ?? 0.5) * gl.drawingBufferWidth,
			(pointer?.y ?? 0.5) * gl.drawingBufferHeight,
		]);
		renderer.render({ scene: mesh });
	};
	const stop = () => {
		cancelAnimationFrame(frame);
		frame = 0;
		lastTime = 0;
	};
	const loop = (time: number) => {
		frame = requestAnimationFrame(loop);
		if (lastTime && time - lastTime < 1000 / 30 - 1) return;
		elapsed += lastTime ? (time - lastTime) / 1000 : 0;
		lastTime = time;
		uniforms.iTime.value = elapsed;
		render();
	};
	const syncAnimation = () => {
		if (!visible || document.hidden || motion.matches || contextLost) {
			stop();
			pointer = undefined;
		} else if (!frame) {
			frame = requestAnimationFrame(loop);
		}
	};
	const setSize = () => {
		const { width, height } = container.getBoundingClientRect();
		renderer.setSize(Math.max(1, Math.floor(width * 0.55)), Math.max(1, Math.floor(height * 0.55)));
		uniforms.iResolution.value.set([gl.drawingBufferWidth, gl.drawingBufferHeight]);
		if (!contextLost) render();
	};
	const resize = new ResizeObserver(() => {
		cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(setSize);
	});
	const intersection = new IntersectionObserver((entries) => {
		visible = entries.some((entry) => entry.isIntersecting);
		syncAnimation();
	});
	const handleContextLost = () => {
		contextLost = true;
		stop();
		console.warn('Plasma: WebGL context was lost; the hero retains its static image and gradient.');
	};

	resize.observe(container);
	intersection.observe(container);
	setSize();
	motion.addEventListener('change', syncAnimation);
	document.addEventListener('visibilitychange', syncAnimation);
	canvas.addEventListener('webglcontextlost', handleContextLost);
	if (props.mouseInteractive) {
		pointerTarget.addEventListener('pointermove', handlePointerMove, { passive: true });
		pointerTarget.addEventListener('pointerleave', handlePointerLeave);
	}

	cleanup = () => {
		stop();
		cancelAnimationFrame(resizeFrame);
		resize.disconnect();
		intersection.disconnect();
		motion.removeEventListener('change', syncAnimation);
		document.removeEventListener('visibilitychange', syncAnimation);
		canvas.removeEventListener('webglcontextlost', handleContextLost);
		pointerTarget.removeEventListener('pointermove', handlePointerMove);
		pointerTarget.removeEventListener('pointerleave', handlePointerLeave);
		geometry.remove();
		gl.deleteProgram(program.program);
		canvas.remove();
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	};
});

onBeforeUnmount(() => cleanup?.());
</script>

<template>
	<div ref="container" class="plasma" />
</template>

<style scoped>
.plasma {
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.plasma :deep(canvas) {
	display: block;
	width: 100% !important;
	height: 100% !important;
}
</style>
