import React, { useEffect, useRef } from 'react';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  scale: number;
  scaleSpeed: number;
  color: string;
  // 预渲染的离屏 canvas
  offscreenCanvas?: HTMLCanvasElement;
}

const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // 目标帧率 30fps，足够流畅且省资源
    const targetFPS = 30;
    const frameInterval = 1000 / targetFPS;

    // 设置画布大小
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // 重新生成离屏 canvas
      ballsRef.current.forEach(ball => {
        ball.offscreenCanvas = createBallCanvas(ball);
      });
    };

    // 随机颜色 - 鲜艳明亮的颜色
    const colors = [
      'rgba(139, 92, 246, 0.6)',   // 紫罗兰
      'rgba(59, 130, 246, 0.6)',   // 天空蓝
      'rgba(236, 72, 153, 0.6)',   // 粉红
      'rgba(16, 185, 129, 0.6)',   // 翡翠绿
      'rgba(245, 158, 11, 0.6)',   // 琪珀色
      'rgba(168, 85, 247, 0.6)',   // 亮紫
      'rgba(14, 165, 233, 0.6)',   // 天蓝
      'rgba(251, 113, 133, 0.6)',  // 玫瑰粉
    ];

    // 预渲染球到离屏 canvas
    const createBallCanvas = (ball: Ball): HTMLCanvasElement => {
      const size = Math.ceil(ball.baseRadius * 2.5); // 留出模糊空间
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return offscreen;

      const centerX = size / 2;
      const centerY = size / 2;
      const radius = ball.baseRadius;

      // 绘制渐变球
      const gradient = offCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, ball.color.replace('0.6', '0.8'));
      gradient.addColorStop(0.5, ball.color);
      gradient.addColorStop(1, ball.color.replace('0.6', '0'));

      offCtx.fillStyle = gradient;
      offCtx.beginPath();
      offCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      offCtx.fill();

      return offscreen;
    };

    // 初始化球
    const initBalls = () => {
      const balls: Ball[] = [];
      const numBalls = 8;

      for (let i = 0; i < numBalls; i++) {
        const baseRadius = Math.random() * 80 + 60; // 60-140px
        const ball: Ball = {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          radius: baseRadius,
          baseRadius: baseRadius,
          scale: 1,
          scaleSpeed: Math.random() * 0.002 + 0.001,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
        ball.offscreenCanvas = createBallCanvas(ball);
        balls.push(ball);
      }
      ballsRef.current = balls;
    };

    // 碰撞检测和处理
    const checkCollision = (ball1: Ball, ball2: Ball) => {
      const dx = ball2.x - ball1.x;
      const dy = ball2.y - ball1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < ball1.radius + ball2.radius) {
        const angle = Math.atan2(dy, dx);
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);

        const vx1 = ball1.vx * cos + ball1.vy * sin;
        const vy1 = ball1.vy * cos - ball1.vx * sin;
        const vx2 = ball2.vx * cos + ball2.vy * sin;
        const vy2 = ball2.vy * cos - ball2.vx * sin;

        ball1.vx = vx2 * cos - vy1 * sin;
        ball1.vy = vy1 * cos + vx2 * sin;
        ball2.vx = vx1 * cos - vy2 * sin;
        ball2.vy = vy2 * cos + vx1 * sin;

        const overlap = (ball1.radius + ball2.radius - distance) / 2;
        ball1.x -= overlap * cos;
        ball1.y -= overlap * sin;
        ball2.x += overlap * cos;
        ball2.y += overlap * sin;
      }
    };

    // 动画循环
    const animate = (currentTime: number) => {
      animationRef.current = requestAnimationFrame(animate);

      // 帧率限制
      const elapsed = currentTime - lastTimeRef.current;
      if (elapsed < frameInterval) return;
      lastTimeRef.current = currentTime - (elapsed % frameInterval);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ballsRef.current.forEach((ball, i) => {
        // 更新位置
        ball.x += ball.vx;
        ball.y += ball.vy;
        
        // 更新大小缩放
        ball.scale += ball.scaleSpeed;
        if (ball.scale > 1.2 || ball.scale < 0.8) {
          ball.scaleSpeed = -ball.scaleSpeed;
        }
        ball.radius = ball.baseRadius * ball.scale;

        // 边界碰撞
        if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
          ball.vx = -ball.vx;
          ball.x = Math.max(ball.radius, Math.min(canvas.width - ball.radius, ball.x));
        }
        if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
          ball.vy = -ball.vy;
          ball.y = Math.max(ball.radius, Math.min(canvas.height - ball.radius, ball.y));
        }

        // 检测与其他球的碰撞
        for (let j = i + 1; j < ballsRef.current.length; j++) {
          checkCollision(ball, ballsRef.current[j]);
        }

        // 使用预渲染的离屏 canvas 绘制
        if (ball.offscreenCanvas) {
          const size = ball.offscreenCanvas.width * ball.scale;
          ctx.drawImage(
            ball.offscreenCanvas,
            ball.x - size / 2,
            ball.y - size / 2,
            size,
            size
          );
        }
      });
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    initBalls();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default AnimatedBackground;
