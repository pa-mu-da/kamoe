import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { LucideZap, LucideHistory, LucideInfo } from 'lucide-react';
import gsap from 'gsap';
import './App.css';

const TOTAL_CHAIRS = 12;
const WIN_SCORE = 40;
const MAX_SHOCKS = 3;

function App() {
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [myMessage, setMyMessage] = useState('');
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localProposedChairId, setLocalProposedChairId] = useState(null);
  const [localProposedShockChairId, setLocalProposedShockChairId] = useState(null);

  // Initialize Player ID
  useEffect(() => {
    let pid = localStorage.getItem('death_game_player_id');
    if (!pid) {
      pid = 'p_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('death_game_player_id', pid);
    }
    setPlayerId(pid);
  }, []);

  // Sync initial name when gameState loads
  useEffect(() => {
    if (gameState && localName === '') {
      const initialName = playerId === gameState.p1 ? gameState.names.p1 : gameState.names.p2;
      setLocalName(initialName);
    }
  }, [gameState, playerId]);

  // Debounced Name Sync
  useEffect(() => {
    if (!gameState || !localName || localName === (playerId === gameState.p1 ? gameState.names.p1 : gameState.names.p2)) return;

    const timer = setTimeout(() => {
      const key = playerId === gameState.p1 ? 'p1' : 'p2';
      const updatedNames = { ...gameState.names, [key]: localName };
      updateRemoteState({ ...gameState, names: updatedNames });
    }, 500);

    return () => clearTimeout(timer);
  }, [localName]);

  // Supabase Subscription
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room:${room.code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${room.id}`
      }, (payload) => {
        setGameState(payload.new.state);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  // Debounced Thinking Log Sync
  useEffect(() => {
    if (!gameState || myMessage === (playerId === gameState.p1 ? gameState.messages.p1 : gameState.messages.p2)) return;
    if (gameState.currentPhase === 'SHOCK' || gameState.currentPhase === 'GAME_OVER') return;

    const timer = setTimeout(() => {
      const key = playerId === gameState.p1 ? 'p1' : 'p2';
      const updatedMessages = { ...gameState.messages, [key]: myMessage };
      updateRemoteState({ ...gameState, messages: updatedMessages });
    }, 1000);

    return () => clearTimeout(timer);
  }, [myMessage, gameState?.currentPhase]);

  useEffect(() => {
    if (!room) {
      gsap.from('.death-game-logo', { y: -50, opacity: 0, duration: 2, ease: 'expo.out' });
      gsap.to('.death-game-logo', { filter: 'drop-shadow(0 0 20px rgba(255, 62, 62, 0.8))', repeat: -1, yoyo: true, duration: 1 });
    }
  }, [room]);

  // GSAP Animations on Phase Change
  useEffect(() => {
    if (!gameState) return;

    if (gameState.currentPhase === 'PREPARE') {
      gsap.fromTo('.game-board', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 1, ease: 'power4.out' });
      gsap.fromTo('.phase-banner', { x: -100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'back.out' });
    }

    if (gameState.currentPhase === 'SHOCK') {
      const isShocked = !gameState.lastResult?.safe;
      if (isShocked) {
        gsap.to('.visual-fx-layer', {
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          duration: 0.05,
          repeat: 20,
          yoyo: true,
          ease: 'none',
          onComplete: () => gsap.to('.visual-fx-layer', { backgroundColor: 'transparent', duration: 0.5 })
        });
      }
    }

    // Reset local optimistic states on phase change
    setLocalProposedChairId(gameState.proposedChairId);
    setLocalProposedShockChairId(gameState.proposedShockChairId);
  }, [gameState?.currentPhase]);

  // Initial State Helper
  const createInitialState = (p1Id) => ({
    p1: p1Id,
    p2: null,
    chairs: Array.from({ length: TOTAL_CHAIRS }, (_, i) => ({ id: i + 1, active: true })),
    scores: { p1: 0, p2: 0 },
    shocks: { p1: 0, p2: 0 },
    currentRound: 1,
    currentPhase: 'WAITING', // WAITING, PREPARE, SELECT, CONFIRMING, FINALIZED, SHOCK, GAME_OVER
    isUra: false,
    switchSide: '',
    seatingSide: '',
    shockChairId: null,
    selectedChairId: null,
    proposedChairId: null, // New field for single-click focus
    lastResult: null,
    messages: { p1: '', p2: '' },
    thoughtHistory: [], // Cumulative list of { name, message, roundTag }
    proposedShockChairId: null, // Confirmation for switch side
    history: [], // Array of { round: number, isUra: boolean, seatingSide: string, score: number, isShocked: boolean }
    names: { p1: 'PLAYER 1', p2: 'PLAYER 2' },
  });

  // Actions
  const createRoom = async () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const initialState = createInitialState(playerId);
    initialState.seatingSide = playerId;
    initialState.switchSide = 'pending';

    // Cleanup old rooms (older than 1 hour) before creating a new one
    try {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      await supabase.from('rooms').delete().lt('updated_at', oneHourAgo);
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert([{ code, state: initialState }])
      .select()
      .single();

    if (error) {
      alert('ルーム作成エラー: ' + error.message);
      return;
    }
    setRoom(data);
    setGameState(data.state);
  };

  const joinRoom = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select()
      .eq('code', roomCode)
      .single();

    if (error || !data) {
      alert('ルームが見つかりません');
      return;
    }

    if (data.state.p2 && data.state.p2 !== playerId) {
      alert('ルームが満員です');
      return;
    }

    let newState = { ...data.state };
    if (!newState.p2 && newState.p1 !== playerId) {
      newState.p2 = playerId;
      newState.currentPhase = 'ROLE_SELECT';

      const { error: updateError } = await supabase
        .from('rooms')
        .update({ state: newState })
        .eq('id', data.id);

      if (updateError) {
        alert('参加エラーが発生しました');
        return;
      }
    }

    setRoom(data);
    setGameState(newState);
  };

  const updateRemoteState = async (newState) => {
    const { error } = await supabase
      .from('rooms')
      .update({ state: newState })
      .eq('id', room.id);
    if (error) console.error('Update error:', error);
  };

  const handleDecideRole = (seatingId, switchId) => {
    const newState = {
      ...gameState,
      seatingSide: seatingId,
      switchSide: switchId,
      currentPhase: 'PREPARE'
    };
    updateRemoteState(newState);
  };

  const handleRandomRoles = () => {
    const players = [gameState.p1, gameState.p2];
    const firstSeating = players[Math.floor(Math.random() * 2)];
    const firstSwitch = players.find(p => p !== firstSeating);
    handleDecideRole(firstSeating, firstSwitch);
  };

  // Game Handlers
  const handleSetShock = (chairId) => {
    if (gameState.currentPhase !== 'PREPARE' || playerId !== gameState.switchSide) return;
    setLocalProposedShockChairId(chairId);
    const newState = { ...gameState, proposedShockChairId: chairId };
    updateRemoteState(newState);
  };

  const handleFinalizeShock = () => {
    if ((gameState.currentPhase !== 'PREPARE' && gameState.currentPhase !== 'CONFIRMING') || playerId !== gameState.switchSide || !gameState.proposedShockChairId) return;

    gsap.to('.phase-banner', { color: '#ff3e3e', repeat: 3, yoyo: true, duration: 0.1 });

    const newState = {
      ...gameState,
      shockChairId: gameState.proposedShockChairId,
      currentPhase: 'SELECT',
      proposedChairId: null,
      proposedShockChairId: null,
      selectedChairId: null,
      messages: { ...gameState.messages, [playerId]: myMessage }
    };
    updateRemoteState(newState);
  };

  const handleCancelShock = () => {
    setLocalProposedShockChairId(null);
    const newState = { ...gameState, proposedShockChairId: null, currentPhase: 'PREPARE' };
    updateRemoteState(newState);
  };

  const handleStandUp = () => {
    if (gameState.currentPhase !== 'FINALIZED' || playerId !== gameState.seatingSide) return;
    const name = playerId === gameState.p1 ? gameState.names.p1 : gameState.names.p2;
    const newState = {
      ...gameState,
      currentPhase: 'SELECT',
      selectedChairId: null,
      proposedChairId: null,
      statusMessage: `${name} は椅子を立ちました`
    };
    setLocalProposedChairId(null);
    updateRemoteState(newState);
    // Clear message after 3 seconds
    setTimeout(async () => {
      const { data } = await supabase.from('rooms').select('state').eq('id', room.id).single();
      if (data && data.state.statusMessage) {
        updateRemoteState({ ...data.state, statusMessage: null });
      }
    }, 3000);
  };

  const handleProposeChair = (chairId) => {
    if (gameState.currentPhase !== 'SELECT' || playerId !== gameState.seatingSide) return;
    setLocalProposedChairId(chairId);
    const newState = { ...gameState, proposedChairId: chairId };
    updateRemoteState(newState);
  };

  const handleAskConfirm = (chairId) => {
    if (gameState.currentPhase === 'SELECT' && playerId === gameState.seatingSide) {
      const newState = { ...gameState, proposedChairId: chairId, currentPhase: 'CONFIRMING' };
      updateRemoteState(newState);
    } else if (gameState.currentPhase === 'PREPARE' && playerId === gameState.switchSide) {
      const newState = { ...gameState, proposedShockChairId: chairId, currentPhase: 'CONFIRMING' };
      updateRemoteState(newState);
    }
  };

  const handleCancelConfirm = () => {
    const newState = {
      ...gameState,
      currentPhase: gameState.currentPhase === 'CONFIRMING' && gameState.proposedShockChairId ? 'PREPARE' : 'SELECT'
    };
    updateRemoteState(newState);
  };

  const handleFinalizeChair = () => {
    if (gameState.currentPhase !== 'CONFIRMING' || playerId !== gameState.seatingSide) return;

    const newState = {
      ...gameState,
      selectedChairId: gameState.proposedChairId,
      currentPhase: 'FINALIZED',
      messages: { ...gameState.messages, [playerId]: myMessage }
    };
    updateRemoteState(newState);
  };

  const handlePushButton = () => {
    if (gameState.currentPhase !== 'FINALIZED' || playerId !== gameState.switchSide) return;

    const isShocked = gameState.selectedChairId === gameState.shockChairId;

    // Capture switch side's message at time of push
    const updatedMessages = { ...gameState.messages, [playerId]: myMessage };

    // Record into history
    const roundLabel = `${gameState.currentRound}回戦 ${gameState.isUra ? '裏' : '表'}`;
    const newEntries = [
      { id: Date.now() + '_p1', name: gameState.names.p1, message: updatedMessages.p1, tag: roundLabel },
      { id: Date.now() + '_p2', name: gameState.names.p2, message: updatedMessages.p2, tag: roundLabel }
    ].filter(e => e.message.trim() !== '');

    const newState = {
      ...gameState,
      currentPhase: 'SHOCK',
      lastResult: { chairId: gameState.selectedChairId, safe: !isShocked },
      messages: updatedMessages,
      thoughtHistory: [...(gameState.thoughtHistory || []), ...newEntries]
    };
    updateRemoteState(newState);

    if (isShocked) {
      document.body.classList.add('screen-shake');
      gsap.to('.visual-fx-layer', {
        opacity: 1, duration: 0.1, repeat: 10, yoyo: true, onComplete: () => {
          document.body.classList.remove('screen-shake');
        }
      });
    }

    setTimeout(() => {
      resolveTurn(isShocked);
    }, 5000);
  };

  const resolveTurn = async (isShocked) => {
    // We need latest state
    const { data } = await supabase.from('rooms').select('state').eq('id', room.id).single();
    let newState = data.state;

    // Clear messages for next round but history is kept
    newState.messages = { p1: '', p2: '' };

    const seatingPid = newState.seatingSide === newState.p1 ? 'p1' : 'p2';
    const chairNum = newState.selectedChairId;

    if (isShocked) {
      newState.scores[seatingPid] = 0;
      newState.shocks[seatingPid] += 1;
    } else {
      newState.scores[seatingPid] += chairNum;
    }

    if (!isShocked) {
      newState.chairs = newState.chairs.filter(c => c.id !== chairNum);
    }

    // Record to history
    newState.history.push({
      round: newState.currentRound,
      isUra: newState.isUra,
      seatingSide: seatingPid,
      score: isShocked ? 0 : chairNum,
      isShocked: isShocked,
      chairId: chairNum // Store which chair was picked
    });

    // Add system summary message
    const switchName = newState.switchSide === newState.p1 ? newState.names.p1 : newState.names.p2;
    const seatingName = newState.seatingSide === newState.p1 ? newState.names.p1 : newState.names.p2;
    const roundTag = `${newState.currentRound}回戦 ${newState.isUra ? '裏' : '表'}`;
    const resultText = isShocked ? '感電' : '生存';

    const systemMsg = {
      id: Date.now() + '_sys',
      name: 'SYSTEM',
      message: `${roundTag}：${switchName}が${newState.shockChairId}番に罠を仕掛け、${seatingName}が${chairNum}番に座った。結果：${resultText}`,
      tag: 'NOTICE',
      isSystem: true
    };

    newState.thoughtHistory = [...(newState.thoughtHistory || []), systemMsg];

    const p1Lose = newState.shocks.p1 >= MAX_SHOCKS;
    const p2Lose = newState.shocks.p2 >= MAX_SHOCKS;
    const p1Win = newState.scores.p1 >= WIN_SCORE;
    const p2Win = newState.scores.p2 >= WIN_SCORE;
    const lastChair = newState.chairs.length === 1;

    if (p1Lose || p2Lose || p1Win || p2Win || lastChair) {
      newState.currentPhase = 'GAME_OVER';
    } else {
      if (!newState.isUra) {
        newState.isUra = true;
        const oldSeating = newState.seatingSide;
        newState.seatingSide = newState.switchSide;
        newState.switchSide = oldSeating;
      } else {
        newState.isUra = false;
        newState.currentRound += 1;
        const oldSeating = newState.seatingSide;
        newState.seatingSide = newState.switchSide;
        newState.switchSide = oldSeating;
      }
      newState.currentPhase = 'PREPARE';
      newState.shockChairId = null;
      newState.selectedChairId = null;
      newState.proposedChairId = null;
      newState.messages = { p1: '', p2: '' };
      // thoughtHistory is already updated in handlePushButton
    }

    updateRemoteState(newState);
    setMyMessage(''); // Clear local message for the new round
    setLocalProposedChairId(null);
    setLocalProposedShockChairId(null);
  };

  // UI Components
  if (!room) {
    return (
      <div className="auth-container glass fade-in">
        <h1 className="death-game-logo" style={{ fontFamily: 'Zen Dots, sans-serif' }}>電気椅子</h1>
        <p className="mono" style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>ONLINE SURVIVAL SYSTEM</p>

        <div className="auth-actions" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '2rem' }}>
          <button onClick={createRoom} className="heavy-btn">セッション作成</button>

          <div className="join-form">
            <input
              type="text"
              placeholder="6桁のコード"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="mono"
            />
            <button onClick={joinRoom}>参加</button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="mono">ニューラルリンク接続中...</div>;

  const isMyTurnAsSwitch = playerId === gameState.switchSide;
  const isMyTurnAsSeating = playerId === gameState.seatingSide;
  const myRole = isMyTurnAsSwitch ? '仕掛け側 (SWITCH)' : '着席側 (SEATING)';

  const getOutcomeText = () => {
    if (gameState.currentPhase !== 'SHOCK') return '';
    return gameState.lastResult.safe ? '生存' : '感 電';
  };

  return (
    <div className="app-container fade-in">
      {/* Scoreboard Modal */}
      {showScoreboard && (
        <div className="confirmation-overlay" onClick={() => setShowScoreboard(false)}>
          <div className="confirmation-card glass scoreboard-card" onClick={e => e.stopPropagation()}>
            <h2 className="mono" style={{ color: 'var(--accent-yellow)', marginBottom: '2rem' }}>SCOREBOARD</h2>
            <div className="scoreboard-container">
              <table className="score-table mono">
                <thead>
                  <tr>
                    <th>ラウンド</th>
                    <th>{gameState.names.p1}</th>
                    <th>{gameState.names.p2}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: gameState.currentRound + 1 }).map((_, rIdx) => {
                    const round = rIdx + 1;
                    const p1Omote = gameState.history.find(h => h.round === round && !h.isUra && h.seatingSide === 'p1');
                    const p1Ura = gameState.history.find(h => h.round === round && h.isUra && h.seatingSide === 'p1');
                    const p2Omote = gameState.history.find(h => h.round === round && !h.isUra && h.seatingSide === 'p2');
                    const p2Ura = gameState.history.find(h => h.round === round && h.isUra && h.seatingSide === 'p2');

                    if (!p1Omote && !p1Ura && !p2Omote && !p2Ura && round > gameState.currentRound) return null;

                    const renderCell = (historyItem) => {
                      if (!historyItem) return <span style={{ opacity: 0.2 }}>-</span>;
                      if (historyItem.isShocked) return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <LucideZap size={14} color="var(--accent-red)" />
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)' }}>({historyItem.chairId})</span>
                        </div>
                      );
                      return historyItem.score;
                    };

                    return (
                      <React.Fragment key={round}>
                        <tr className="round-row">
                          <td rowSpan={2} className="round-num">{round}</td>
                          <td>{renderCell(p1Omote)} <small style={{ opacity: 0.5 }}>(表)</small></td>
                          <td>{renderCell(p2Omote)} <small style={{ opacity: 0.5 }}>(表)</small></td>
                        </tr>
                        <tr className="round-row ura">
                          <td>{renderCell(p1Ura)} <small style={{ opacity: 0.5 }}>(裏)</small></td>
                          <td>{renderCell(p2Ura)} <small style={{ opacity: 0.5 }}>(裏)</small></td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td>TOTAL</td>
                    <td>{gameState.scores.p1}</td>
                    <td>{gameState.scores.p2}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button onClick={() => setShowScoreboard(false)} style={{ marginTop: '2rem' }} className="heavy-btn">閉じる</button>
          </div>
        </div>
      )}

      {gameState.currentPhase === 'CONFIRMING' && (
        (gameState.proposedShockChairId && isMyTurnAsSwitch) ||
        (gameState.proposedChairId && (isMyTurnAsSeating || isMyTurnAsSwitch))
      ) && (
          <div className="confirmation-overlay">
            <div className="confirmation-card glass">
              {/* Case 1: Switching side is confirming their trap */}
              {gameState.proposedShockChairId && isMyTurnAsSwitch && (
                <>
                  <div className="big-number">{gameState.proposedShockChairId}</div>
                  <div className="confirm-text">この椅子に仕掛けますか？</div>
                  <div className="confirm-actions">
                    <button className="btn-yes" onClick={handleFinalizeShock}>はい</button>
                    <button className="btn-no" onClick={handleCancelConfirm}>いいえ</button>
                  </div>
                </>
              )}

              {/* Case 2: Seating side is confirming their chair */}
              {gameState.proposedChairId && (
                isMyTurnAsSeating ? (
                  <>
                    <div className="big-number">{gameState.proposedChairId}</div>
                    <div className="confirm-text">この椅子に座りますか？</div>
                    <div className="confirm-actions">
                      <button className="btn-yes" onClick={handleFinalizeChair}>はい</button>
                      <button className="btn-no" onClick={handleCancelConfirm}>いいえ</button>
                    </div>
                  </>
                ) : isMyTurnAsSwitch ? (
                  <>
                    <div className="big-number">{gameState.proposedChairId}</div>
                    <div className="confirm-text dots-animation left-align">
                      {gameState.seatingSide === gameState.p1 ? gameState.names.p1 : gameState.names.p2}がこの椅子に座ろうとしています
                    </div>
                  </>
                ) : null
              )}
            </div>
          </div>
        )}

      {/* Role Selection Modal */}
      {gameState.currentPhase === 'ROLE_SELECT' && (
        <div className="confirmation-overlay">
          <div className="confirmation-card glass role-selection-card" style={{ maxWidth: '600px' }}>
            <h2 className="mono" style={{ color: 'var(--accent-yellow)', marginBottom: '1.5rem' }}>プレイヤー設定 & 順番決め</h2>

            <div className="name-input-area" style={{ marginBottom: '2rem', textAlign: 'left' }}>
              <label className="mono" style={{ fontSize: '0.8rem', opacity: 0.7 }}>あなたの名前を表示:</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="mono"
                style={{ width: '100%', padding: '0.8rem', marginTop: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: 'white' }}
                placeholder="名前を入力..."
              />
            </div>

            <div className="confirm-text" style={{ fontSize: '1.2rem' }}>最初の役割を選択してください。</div>

            <div className="role-buttons-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => handleDecideRole(playerId, playerId === gameState.p1 ? gameState.p2 : gameState.p1)}
                className="heavy-btn"
                style={{ fontSize: '0.9rem' }}
              >
                私が先に座る
              </button>
              <button
                onClick={() => handleDecideRole(playerId === gameState.p1 ? gameState.p2 : gameState.p1, playerId)}
                className="heavy-btn"
                style={{ fontSize: '0.9rem' }}
              >
                私が先に仕掛ける
              </button>
            </div>
            <button onClick={handleRandomRoles} className="heavy-btn huge" style={{ fontSize: '1.5rem', width: '100%', padding: '1rem' }}>
              ランダムで決める
            </button>
          </div>
        </div>
      )}

      <div className="visual-fx-layer"></div>

      <header className="room-info glass">
        <div className="mono">ROOM: {room.code}</div>
        <div className="mono" style={{ color: 'var(--accent-yellow)' }}>
          {gameState.currentRound}回戦 {gameState.isUra ? '裏' : '表'}
        </div>
        <div className="mono" style={{ color: isMyTurnAsSwitch || isMyTurnAsSeating ? 'var(--success)' : 'white' }}>
          役割: {myRole}
        </div>
      </header>

      <div className="game-stats">
        <div
          className={`player-card glass ${gameState.seatingSide === gameState.p1 ? 'is-active' : ''}`}
          onClick={() => setShowScoreboard(true)}
          style={{ cursor: 'pointer' }}
        >
          <div className="mono label">{gameState.names.p1} {gameState.p1 === playerId && '(あなた)'}</div>
          <div className="score-value mono">{gameState.scores.p1}</div>
          <div className="shock-count">
            {[...Array(MAX_SHOCKS)].map((_, i) => (
              <div key={i} className={`shock-dot ${i < gameState.shocks.p1 ? 'active' : ''}`} />
            ))}
          </div>
        </div>
        <div
          className={`player-card glass ${gameState.seatingSide === gameState.p2 ? 'is-active' : ''}`}
          onClick={() => setShowScoreboard(true)}
          style={{ cursor: 'pointer' }}
        >
          <div className="mono label">{gameState.names.p2} {gameState.p2 === playerId && '(あなた)'}</div>
          <div className="score-value mono">{gameState.scores.p2}</div>
          <div className="shock-count">
            {[...Array(MAX_SHOCKS)].map((_, i) => (
              <div key={i} className={`shock-dot ${i < gameState.shocks.p2 ? 'active' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {gameState.currentPhase === 'FINALIZED' && isMyTurnAsSwitch && (
        <div className="shock-button-container top-position">
          <button onClick={handlePushButton} className="heavy-btn huge">
            電撃スイッチ ON
          </button>
        </div>
      )}

      <div className="phase-banner mono">
        {gameState.currentPhase === 'WAITING' && '対戦相手の入室を待っています...'}
        {gameState.currentPhase === 'PREPARE' && (
          isMyTurnAsSwitch ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', justifyContent: 'center' }}>
              <span>罠を仕掛ける椅子をダブルクリックしてください</span>
            </div>
          ) : '相手が罠を仕掛けています...'
        )}
        {gameState.currentPhase === 'SELECT' && (isMyTurnAsSeating ? '座る椅子を選択してください' : '相手が椅子を吟味しています...')}
        {gameState.currentPhase === 'CONFIRMING' && (isMyTurnAsSeating ? '最終確認中...' : '相手が座る椅子を決めようとしています...')}
        {gameState.currentPhase === 'FINALIZED' && (isMyTurnAsSeating ? '着席完了。運命を待ちなさい。' : '相手が着席しました。ボタンを押せ。')}
        {gameState.statusMessage && <div className="status-msg fade-in">{gameState.statusMessage}</div>}
        {gameState.currentPhase === 'SHOCK' && getOutcomeText()}
        {gameState.currentPhase === 'GAME_OVER' && 'ゲーム終了'}
      </div>

      <div className="game-board-area">
        {(gameState.currentPhase === 'PREPARE' || (gameState.currentPhase === 'CONFIRMING' && gameState.proposedShockChairId)) && isMyTurnAsSeating && (
          <div className="board-overlay fade-in">
            <div className="big-number">?</div>
            <div className="confirm-text">対戦相手が罠を仕掛けています...</div>
          </div>
        )}
        <div className="game-board-container">

          <div className="game-board circle-layout" onContextMenu={(e) => e.preventDefault()}>
            {gameState.currentPhase === 'FINALIZED' && isMyTurnAsSeating && (
              <button onClick={handleStandUp} className="heavy-btn stand-up-btn-center fade-in">
                椅子を立つ
              </button>
            )}

            {Array.from({ length: TOTAL_CHAIRS }).map((_, i) => {
              const id = i + 1;
              const chair = gameState.chairs.find(c => c.id === id);
              const isRemoved = !chair;

              const isProposed = (isMyTurnAsSeating ? localProposedChairId : gameState.proposedChairId) === id;
              const isSelected = gameState.selectedChairId === id;
              const isShocked = gameState.currentPhase === 'SHOCK' && gameState.shockChairId === id;
              const isWinner = gameState.currentPhase === 'SHOCK' && gameState.selectedChairId === id && !isShocked;

              const effectiveProposedShockChairId = isMyTurnAsSwitch ? localProposedShockChairId : gameState.proposedShockChairId;
              const isShockProposed = (effectiveProposedShockChairId === id || (gameState.currentPhase === 'CONFIRMING' && effectiveProposedShockChairId === id));

              // Circular position (Clock layout)
              const angle = (id * 30) - 90; // 12 -> 360-90=270, 1 -> 30-90=-60
              const baseTransform = `rotate(${angle}deg) translate(min(35vw, 300px)) rotate(${-angle}deg)`;
              const style = {
                '--base-transform': baseTransform,
                transform: baseTransform,
                opacity: isRemoved ? 0.1 : 1,
                cursor: isRemoved ? 'default' : 'pointer'
              };

              return (
                <div
                  key={id}
                  className={`chair glass ${isProposed ? 'selecting' : ''} ${isSelected ? 'seated' : ''} ${isShocked ? 'shocked' : ''} ${isWinner ? 'safe' : ''} ${isMyTurnAsSwitch && isShockProposed ? 'shock-proposing' : ''}`}
                  style={style}
                  onClick={() => {
                    if (isRemoved) return;
                    if (gameState.currentPhase === 'PREPARE') handleSetShock(id);
                    if (gameState.currentPhase === 'SELECT') handleProposeChair(id);
                  }}
                  onDoubleClick={() => {
                    if (isRemoved) return;
                    if (gameState.currentPhase === 'PREPARE') handleAskConfirm(id);
                    if (gameState.currentPhase === 'SELECT') handleAskConfirm(id);
                  }}
                >
                  <div className="chair-number mono">{id}</div>
                  <div className="chair-label mono">{isRemoved ? 'VOID' : 'ACTIVE'}</div>
                  {isMyTurnAsSwitch && gameState.shockChairId === id && gameState.currentPhase !== 'SHOCK' && (
                    <div className="trap-icon-overlay">
                      <LucideZap size={32} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="control-panel glass">
        {gameState.currentPhase === 'GAME_OVER' && (
          <div className="mono" style={{ fontSize: '2rem', color: 'var(--accent-yellow)' }}>
            最終勝者: {gameState.scores.p1 > gameState.scores.p2 ? gameState.names.p1 : gameState.names.p2}
          </div>
        )}

        <div className="message-areas">
          <div className="message-box">
            <label className="mono"><LucideInfo size={12} /> 思考ログ (未公開)</label>
            <textarea
              placeholder="心理戦の過程を記録してください..."
              value={myMessage}
              onChange={(e) => setMyMessage(e.target.value)}
              disabled={gameState.currentPhase === 'SHOCK' || gameState.currentPhase === 'GAME_OVER'}
            />
          </div>
          <div className="message-box">
            <label className="mono"><LucideHistory size={12} /> 公開された思考ログ</label>
            <div className="message-display mono history-mode">
              {gameState.thoughtHistory && gameState.thoughtHistory.length > 0 ? (
                gameState.thoughtHistory.map((log) => (
                  <div key={log.id} className={`history-item ${log.isSystem ? 'system-log' : ''}`}>
                    <div className="history-meta">
                      <span className="log-tag">{log.tag}</span>
                      <span className="log-name">{log.name}</span>
                    </div>
                    <div className="log-content">{log.message}</div>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.3 }}>ターン終了時にログが公開されます</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
