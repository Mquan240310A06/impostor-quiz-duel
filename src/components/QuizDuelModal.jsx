import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COLOR_SCHEMES = [
  { bg: 'bg-red-600 hover:bg-red-500 active:bg-red-700', shape: '▲', label: '1' },
  { bg: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700', shape: '◆', label: '2' },
  { bg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600', shape: '●', label: '3' },
  { bg: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700', shape: '■', label: '4' },
];

export default function QuizDuelModal({ socket, roomId, duelData, onComplete }) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [timeLeft, setTimeLeft] = useState(duelData.durationMs);
  const hasSubmitted = useRef(false);

  const durationSec = duelData.durationMs / 1000;

  const handleSelectOption = useCallback((idx) => {
    if (hasSubmitted.current || outcome) return;
    hasSubmitted.current = true;
    setSelectedIdx(idx);

    socket.emit('submit_duel_answer', {
      roomId,
      duelId: duelData.duelId,
      selectedOption: idx,
    });
  }, [socket, roomId, duelData.duelId, outcome]);

  useEffect(() => {
    const handleOutcome = (data) => {
      setOutcome(data.result);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 3000);
    };

    socket.on('duel_outcome', handleOutcome);
    return () => socket.off('duel_outcome', handleOutcome);
  }, [socket, onComplete]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 50));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['1', 'Digit1'].includes(e.code) || e.key === '1') handleSelectOption(0);
      if (['2', 'Digit2'].includes(e.code) || e.key === '2') handleSelectOption(1);
      if (['3', 'Digit3'].includes(e.code) || e.key === '3') handleSelectOption(2);
      if (['4', 'Digit4'].includes(e.code) || e.key === '4') handleSelectOption(3);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectOption]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="w-full max-w-2xl bg-neutral-900 border-2 border-red-600 rounded-2xl p-6 shadow-[0_0_50px_rgba(220,38,38,0.4)] flex flex-col items-center text-white"
      >
        <div className="flex items-center justify-between w-full border-b border-neutral-700 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full uppercase tracking-wider font-black bg-red-600 text-white animate-pulse">
              1v1 Showdown
            </span>
            <span className="text-sm font-semibold text-neutral-300">
              Đối thủ: <strong className="text-red-400">{duelData.opponentUsername}</strong>
            </span>
          </div>
          <div className="text-xl font-mono font-black text-amber-400">
            {(timeLeft / 1000).toFixed(1)}s
          </div>
        </div>

        <div className="w-full bg-neutral-800 h-2.5 rounded-full overflow-hidden mb-6">
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: durationSec, ease: 'linear' }}
            className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-600"
          />
        </div>

        <div className="min-h-[90px] flex items-center justify-center text-center px-4 mb-6">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow">
            {duelData.prompt}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full mb-4">
          {duelData.options.map((option, idx) => {
            const config = COLOR_SCHEMES[idx];
            const isSelected = selectedIdx === idx;

            return (
              <motion.button
                key={idx}
                whileHover={!hasSubmitted.current ? { scale: 1.02 } : {}}
                whileTap={!hasSubmitted.current ? { scale: 0.98 } : {}}
                onClick={() => handleSelectOption(idx)}
                disabled={hasSubmitted.current || outcome !== null}
                className={`relative flex items-center gap-3 p-5 rounded-xl border-2 font-bold text-left transition-all ${config.bg} ${
                  isSelected ? 'ring-4 ring-white shadow-2xl scale-[1.02]' : 'opacity-90 hover:opacity-100'
                } ${hasSubmitted.current && !isSelected ? 'opacity-40 grayscale-[50%]' : ''}`}
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-black/30 text-xl font-black shrink-0">
                  {config.shape}
                </div>
                <span className="text-lg md:text-xl font-semibold flex-1 leading-snug break-words">
                  {option}
                </span>
                <span className="absolute top-2 right-2 text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-neutral-300">
                  Phím [{config.label}]
                </span>
              </motion.button>
            );
          })}
        </div>

        {hasSubmitted.current && !outcome && (
          <div className="mt-2 text-sm text-neutral-400 animate-pulse font-medium">
            Đã nộp đáp án! Đang đợi máy chủ đối chiếu mili-giây...
          </div>
        )}

        <AnimatePresence>
          {outcome && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/90 p-6 text-center z-10"
            >
              {outcome === 'VICTORY' && (
                <>
                  <div className="text-6xl mb-2">👑</div>
                  <h3 className="text-4xl font-black text-emerald-400 tracking-wider uppercase mb-1">
                    CHIẾN THẮNG!
                  </h3>
                  <p className="text-neutral-300 font-medium">
                    Bạn đã phản xạ nhanh hơn và hạ gục đối thủ!
                  </p>
                </>
              )}
              {outcome === 'DEFEAT' && (
                <>
                  <div className="text-6xl mb-2">💀</div>
                  <h3 className="text-4xl font-black text-red-500 tracking-wider uppercase mb-1">
                    BỊ HẠ GỤC!
                  </h3>
                  <p className="text-neutral-300 font-medium">
                    Bạn đã trả lời sai hoặc chậm hơn đối thủ. Bạn đã trở thành Hồn ma!
                  </p>
                </>
              )}
              {outcome === 'DRAW' && (
                <>
                  <div className="text-6xl mb-2">⚡</div>
                  <h3 className="text-4xl font-black text-amber-400 tracking-wider uppercase mb-1">
                    HÒA NHAU!
                  </h3>
                  <p className="text-neutral-300 font-medium">
                    Cả hai đều đoán sai hoặc hết giờ. Bị choáng tại chỗ 3 giây!
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
