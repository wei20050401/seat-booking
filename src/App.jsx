import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const ROWS = Array.from({ length: 15 }, (_, i) => String.fromCharCode(65 + i));
const COLS = Array.from({ length: 20 }, (_, i) => i + 1);
const AISLE_AFTER_COLS = [7, 13];
const ADMIN_NAME = "admin";
const ADMIN_STUDENT_ID = "0000";

const AREA_CONFIG = {
  前區: { rows: ["A", "B", "C", "D", "E"], price: 500, color: "front" },
  中區: { rows: ["F", "G", "H", "I", "J"], price: 400, color: "middle" },
  後區: { rows: ["K", "L", "M", "N", "O"], price: 300, color: "back" },
};

const AREA_FILTERS = ["全部", "前區", "中區", "後區"];
const initialBookedSeats = [];

export function getSeatArea(row) {
  return Object.entries(AREA_CONFIG).find(([, config]) => config.rows.includes(row))?.[0] || "後區";
}

export function createSeats() {
  return ROWS.flatMap((row) =>
    COLS.map((col) => {
      const area = getSeatArea(row);
      return {
        id: `${row}${col}`,
        row,
        col,
        area,
        price: AREA_CONFIG[area].price,
      };
    })
  );
}

export function calculateTotal(seats, selectedSeatIds) {
  return seats
    .filter((seat) => selectedSeatIds.includes(seat.id))
    .reduce((sum, seat) => sum + seat.price, 0);
}

export function createBookingRecord({ user, selectedSeats, total, now = new Date() }) {
  return {
    id: now.getTime(),
    user,
    seats: [...selectedSeats].sort(),
    total,
    time: now.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function runSeatBookingTests() {
  const seats = createSeats();
  console.assert(seats.length === 300, "createSeats should create 300 seats.");
  console.assert(seats.filter((seat) => seat.area === "前區").length === 100, "Front area should have 100 seats.");
  console.assert(seats.filter((seat) => seat.area === "中區").length === 100, "Middle area should have 100 seats.");
  console.assert(seats.filter((seat) => seat.area === "後區").length === 100, "Back area should have 100 seats.");
  console.assert(calculateTotal(seats, ["A1", "F1", "K1"]) === 1200, "Total should support three prices.");
  console.assert(AISLE_AFTER_COLS.join(",") === "7,13", "Aisles should split each row into 7-6-7 seats.");
}

runSeatBookingTests();

export default function OnlineSeatBookingPlatform() {
  const defaultSeats = useMemo(() => createSeats(), []);
  const [seats, setSeats] = useState(defaultSeats);
  const [isLoading, setIsLoading] = useState(false);
  const [systemMessage, setSystemMessage] = useState("");
  const [currentPage, setCurrentPage] = useState("home");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [authMessage, setAuthMessage] = useState("");
  const [currentUser, setCurrentUser] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [bookedSeats, setBookedSeats] = useState(initialBookedSeats);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [records, setRecords] = useState([]);
  const [areaFilter, setAreaFilter] = useState("全部");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  const isAdmin = currentUser.toLowerCase() === ADMIN_NAME;
  const visibleRows = areaFilter === "全部" ? ROWS : AREA_CONFIG[areaFilter].rows;
  const total = calculateTotal(seats, selectedSeats);

  useEffect(() => {
    loadBackendData();
  }, []);

  const loadBackendData = async () => {
    if (!supabase) {
      setSystemMessage("尚未設定 Supabase，資料目前只存在前端。");
      return;
    }

    setIsLoading(true);
    setSystemMessage("");

    try {
      const seatsResult = await supabase
        .from("seats")
        .select("seat_id, area, price, is_booked")
        .order("seat_id", { ascending: true });

      if (seatsResult.error) {
        setSystemMessage("讀取座位失敗：" + seatsResult.error.message);
      } else if (seatsResult.data) {
        const syncedSeats = seatsResult.data.map((seat) => {
          const row = seat.seat_id.match(/^[A-Z]+/)?.[0] || "";
          const col = Number(seat.seat_id.match(/[0-9]+$/)?.[0] || 0);
          return {
            id: seat.seat_id,
            row,
            col,
            area: seat.area,
            price: seat.price,
          };
        });

        if (syncedSeats.length > 0) {
          setSeats(syncedSeats);
        } else {
          setSeats(defaultSeats);
          setSystemMessage("資料庫 seats 目前沒有座位資料，暫時使用前端預設座位。");
        }

        setBookedSeats(seatsResult.data.filter((seat) => seat.is_booked).map((seat) => seat.seat_id));
      }

      const bookingsResult = await supabase
        .from("bookings")
        .select("id, seats, total, created_at, users(name, student_id)")
        .order("created_at", { ascending: false });

      if (bookingsResult.error) {
        setSystemMessage("讀取訂位紀錄失敗：" + bookingsResult.error.message);
      } else if (bookingsResult.data) {
        setRecords(
          bookingsResult.data.map((booking) => ({
            id: booking.id,
            user: booking.users ? booking.users.name + " (" + booking.users.student_id + ")" : "未知使用者",
            seats: booking.seats,
            total: booking.total,
            time: new Date(booking.created_at).toLocaleString("zh-TW", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          }))
        );
      }
    } catch (error) {
      setSystemMessage("後台連線失敗，請檢查 .env 的 VITE_SUPABASE_URL 是否只到 .supabase.co，不要包含 /rest/v1。");
      setSeats(defaultSeats);
    }

    setIsLoading(false);
  };

  const register = async () => {
    const trimmedName = name.trim();
    const trimmedStudentId = studentId.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedStudentId || !trimmedEmail) {
      setAuthMessage("請輸入姓名、學號與 Email。");
      return;
    }

    if (!trimmedEmail.includes("@")) {
      setAuthMessage("請輸入正確 Email。");
      return;
    }

    if (trimmedName.toLowerCase() === ADMIN_NAME && trimmedStudentId === ADMIN_STUDENT_ID) {
      setAuthMessage("管理者帳號不需要註冊，請直接登入。");
      return;
    }

    if (!supabase) {
      if (registeredUsers.some((user) => user.studentId === trimmedStudentId)) {
        setAuthMessage("此學號已註冊，請直接登入。");
        return;
      }
      setRegisteredUsers((prev) => [...prev, { name: trimmedName, studentId: trimmedStudentId, email: trimmedEmail }]);
      setAuthMessage("註冊成功，請登入。");
      setAuthMode("login");
      setName("");
      setStudentId("");
      setEmail("");
      return;
    }

    setIsLoading(true);
    const result = await supabase.from("users").insert({
      name: trimmedName,
      student_id: trimmedStudentId,
      email: trimmedEmail,
    });
    setIsLoading(false);

    if (result.error) {
      setAuthMessage("註冊失敗：" + result.error.message);
      return;
    }

    setAuthMessage("註冊成功，請登入。");
    setAuthMode("login");
    setName("");
    setStudentId("");
    setEmail("");
  };

  const login = async () => {
    const trimmedName = name.trim();
    const trimmedStudentId = studentId.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedStudentId || !trimmedEmail) {
      setAuthMessage("請輸入姓名、學號與 Email。");
      return;
    }

    if (trimmedName.toLowerCase() === ADMIN_NAME && trimmedStudentId === ADMIN_STUDENT_ID) {
      setCurrentUser(ADMIN_NAME);
      setCurrentUserId(null);
      setAuthMessage("");
      setName("");
      setStudentId("");
      setEmail("");
      setSelectedSeats([]);
      await loadBackendData();
      return;
    }

    if (!supabase) {
      const matchedUser = registeredUsers.find(
        (user) => user.name === trimmedName && user.studentId === trimmedStudentId && user.email === trimmedEmail
      );
      if (!matchedUser) {
        setAuthMessage("尚未註冊或資料不正確。");
        return;
      }
      setCurrentUser(`${matchedUser.name} (${matchedUser.studentId})`);
      setCurrentUserId(null);
      setAuthMessage("");
      setName("");
      setStudentId("");
      setEmail("");
      setSelectedSeats([]);
      return;
    }

    setIsLoading(true);
    const result = await supabase
      .from("users")
      .select("id, name, student_id, email")
      .eq("name", trimmedName)
      .eq("student_id", trimmedStudentId)
      .eq("email", trimmedEmail)
      .maybeSingle();
    setIsLoading(false);

    if (result.error) {
      setAuthMessage("登入失敗：" + result.error.message);
      return;
    }

    if (!result.data) {
      setAuthMessage("尚未註冊或資料不正確。");
      return;
    }

    setCurrentUser(result.data.name + " (" + result.data.student_id + ")");
    setCurrentUserId(result.data.id);
    setAuthMessage("");
    setName("");
    setStudentId("");
    setEmail("");
    setSelectedSeats([]);
    await loadBackendData();
  };

  const submitAuth = () => {
    if (authMode === "register") register();
    else login();
  };

  const logout = () => {
    setCurrentUser("");
    setSelectedSeats([]);
    setAuthMessage("");
  };

  const toggleSeat = (id) => {
    if (!currentUser || isAdmin || bookedSeats.includes(id)) return;
    setSelectedSeats((prev) => (prev.includes(id) ? prev.filter((seatId) => seatId !== id) : [...prev, id]));
  };

  const confirmBooking = async () => {
    if (!currentUser || isAdmin || selectedSeats.length === 0) return;

    const latestBooked = await getLatestBookedSeats();
    const duplicatedSeat = selectedSeats.find((seatId) => latestBooked.includes(seatId));

    if (duplicatedSeat) {
      setSystemMessage(`${duplicatedSeat} 已被其他人預訂，請重新選擇。`);
      setBookedSeats(latestBooked);
      setSelectedSeats([]);
      return;
    }

    if (!supabase || !currentUserId) {
      const newRecord = createBookingRecord({ user: currentUser, selectedSeats, total });
      setRecords((prev) => [newRecord, ...prev]);
      setBookedSeats((prev) => [...prev, ...selectedSeats]);
      setSelectedSeats([]);
      return;
    }

    setIsLoading(true);

    const bookingResult = await supabase.from("bookings").insert({
      user_id: currentUserId,
      seats: selectedSeats,
      total,
    });

    if (bookingResult.error) {
      setSystemMessage("訂位失敗：" + bookingResult.error.message);
      setIsLoading(false);
      return;
    }

    const seatResult = await supabase
      .from("seats")
      .update({ is_booked: true })
      .in("seat_id", selectedSeats);

    if (seatResult.error) {
      setSystemMessage("更新座位失敗：" + seatResult.error.message);
      setIsLoading(false);
      return;
    }

    setSelectedSeats([]);
    await loadBackendData();
    setSystemMessage("訂位成功，資料已同步到後台。");
    setIsLoading(false);
  };

  const getLatestBookedSeats = async () => {
    if (!supabase) return bookedSeats;

    const result = await supabase.from("seats").select("seat_id, is_booked");
    if (result.error || !result.data) return bookedSeats;

    return result.data.filter((seat) => seat.is_booked).map((seat) => seat.seat_id);
  };

  const resetSelection = () => setSelectedSeats([]);

  const cancelBooking = async (record) => {
    if (!window.confirm(`確定取消 ${record.seats.join("、")} 的訂位？`)) return;

    if (!supabase) {
      setBookedSeats((prev) => prev.filter((seatId) => !record.seats.includes(seatId)));
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      return;
    }

    setIsLoading(true);

    const updateSeatResult = await supabase
      .from("seats")
      .update({ is_booked: false })
      .in("seat_id", record.seats);

    if (updateSeatResult.error) {
      setSystemMessage("取消訂位失敗：" + updateSeatResult.error.message);
      setIsLoading(false);
      return;
    }

    const deleteBookingResult = await supabase
      .from("bookings")
      .delete()
      .eq("id", record.id);

    if (deleteBookingResult.error) {
      setSystemMessage("刪除訂位紀錄失敗：" + deleteBookingResult.error.message);
      setIsLoading(false);
      return;
    }

    setRecords((prev) => prev.filter((item) => item.id !== record.id));
    setBookedSeats((prev) => prev.filter((seatId) => !record.seats.includes(seatId)));
    await loadBackendData();
    setSystemMessage("已成功取消訂位。")
    setIsLoading(false);
  };

  const getSeatClassName = (seat) => {
    if (bookedSeats.includes(seat.id)) return "seat booked";
    if (selectedSeats.includes(seat.id)) return "seat selected";
    return `seat ${AREA_CONFIG[seat.area].color}`;
  };

  if (currentPage === "home") {
    return (
      <>
        <AppStyles />
        <main className="home-page">
          <section className="home-card">
            <div className="home-icon">🎟️</div>
            <p className="eyebrow">ONLINE BOOKING SYSTEM</p>
            <h1>線上劃位平台</h1>
            <p className="home-desc">支援前區、中區、後區三種票價與即時座位選擇，管理者可登入查看完整訂位紀錄。</p>
            <button className="primary big" onClick={() => setCurrentPage("booking")}>🎟️ 進入劃位</button>

            <div className="price-grid">
              <div className="price-card front-box"><b>前區</b><span>最佳視野座位</span><strong>$500</strong></div>
              <div className="price-card middle-box"><b>中區</b><span>平衡觀看位置</span><strong>$400</strong></div>
              <div className="price-card back-box"><b>後區</b><span>經濟實惠座位</span><strong>$300</strong></div>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <AppStyles />
      <main className="app-page">
        <div className="app-shell">
          <button className="outline small" onClick={() => setCurrentPage("home")}>🏠 主頁</button>
          {systemMessage && <div className="system-message">{systemMessage}</div>}
          {isLoading && <div className="system-message">資料同步中...</div>}

          <section className="hero-card">
            <div>
              <p className="eyebrow">Online Seat Booking</p>
              <h1 onClick={() => setCurrentPage("home")}>線上劃位平台</h1>
              <p>請輸入姓名、學號與 Email 登入後進行劃位。</p>
            </div>
          </section>

          <section className="layout-grid">
            <aside className="panel side-panel">
              <h2>篩選區</h2>
              <p className="muted">只顯示剩餘可選座位</p>
              <button
                className={showAvailableOnly ? "primary full" : "outline full"}
                onClick={() => setShowAvailableOnly((prev) => !prev)}
              >
                未被預訂
              </button>
            </aside>

            <section className="panel seats-panel">
              <div className="seat-header">
                <h2>💺 座位圖</h2>
                <div className="filter-buttons">
                  {AREA_FILTERS.map((area) => (
                    <button key={area} className={areaFilter === area ? "primary" : "outline"} onClick={() => setAreaFilter(area)}>
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stage">STAGE</div>

              <div className="seat-scroll">
                <div className="seat-map">
                  {visibleRows.map((row) => (
                    <div key={row} className="seat-row">
                      <div className="row-label">{row}</div>
                      {COLS.map((col) => {
                        const seat = seats.find((item) => item.id === `${row}${col}`);
                        if (!seat) {
                          return <div key={`${row}${col}`} className="seat-placeholder" />;
                        }
                        const hidden = showAvailableOnly && bookedSeats.includes(seat.id);

                        return (
                          <React.Fragment key={seat.id}>
                            {hidden ? (
                              <div className="seat-placeholder" />
                            ) : (
                              <button className={getSeatClassName(seat)} onClick={() => toggleSeat(seat.id)} disabled={bookedSeats.includes(seat.id)}>
                                {seat.id}
                              </button>
                            )}
                            {AISLE_AFTER_COLS.includes(col) && <div className="aisle" title="走道" />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="legend-grid">
                <div className="legend front-box">前區：$500</div>
                <div className="legend middle-box">中區：$400</div>
                <div className="legend back-box">後區：$300</div>
                <div className="legend booked-box">已預訂</div>
              </div>
            </section>

            <aside className="right-column">
              <section className="auth-card">
                <h2>{authMode === "login" ? "👤 使用者登入" : "➕ 使用者註冊"}</h2>
                {currentUser ? (
                  <div className="user-row">
                    <div>
                      <p className="muted">目前使用者</p>
                      <b>{currentUser}</b>
                      {isAdmin && <p className="admin-text">管理者模式</p>}
                    </div>
                    <button className="outline" onClick={logout}>登出</button>
                  </div>
                ) : (
                  <div className="form-stack">
                    <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAuth()} />
                    <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAuth()} />
                    <div className="input-row">
                      <input placeholder="學號" value={studentId} onChange={(e) => setStudentId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAuth()} />
                      <button className="primary" onClick={submitAuth}>{authMode === "login" ? "登入" : "註冊"}</button>
                    </div>
                    {authMessage && <p className="error-text">{authMessage}</p>}
                    <button
                      className="ghost"
                      onClick={() => {
                        setAuthMode((prev) => (prev === "login" ? "register" : "login"));
                        setAuthMessage("");
                      }}
                    >
                      {authMode === "login" ? "還沒有帳號？前往註冊" : "已有帳號？返回登入"}
                    </button>
                  </div>
                )}
              </section>
              {!isAdmin && (
                <section className="panel">
                  <h2>🎫 訂位確認</h2>
                  {!currentUser && <div className="notice">請先輸入姓名登入，才能選擇座位。</div>}
                  <div className="selected-box">
                    <p className="muted">已選座位</p>
                    {selectedSeats.length === 0 ? (
                      <p className="empty">尚未選擇座位</p>
                    ) : (
                      <div className="chips">
                        {[...selectedSeats].sort().map((seatId) => {
                          const seat = seats.find((item) => item.id === seatId);
                          return <span key={seatId}>{seatId}・{seat.area}・${seat.price}</span>;
                        })}
                      </div>
                    )}
                  </div>

                  <div className="total-row"><b>總金額</b><strong>${total}</strong></div>
                  <div className="action-row">
                    <button className="outline" onClick={resetSelection}>↻ 清除</button>
                    <button className="primary" onClick={confirmBooking} disabled={!currentUser || selectedSeats.length === 0}>✓ 確認</button>
                  </div>
                </section>
              )}

              {isAdmin && (
                <section className="panel">
                  <h2>🛡️ 管理者訂位紀錄</h2>
                  {records.length === 0 ? (
                    <p className="muted">目前沒有新的訂位紀錄。</p>
                  ) : (
                    <div className="records">
                      {records.map((record) => (
                        <div key={record.id} className="record-card">
                          <div className="record-top"><b>{record.user}</b><span>{record.time}</span></div>
                          <p>座位：{record.seats.join("、")}</p>
                          <b>總金額：${record.total}</b>
                          <button className="outline cancel-btn" onClick={() => cancelBooking(record)}>
                            取消訂位
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </aside>
          </section>
        </div>
      </main>
    </>
  );
}

function AppStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html, body, #root { width: 100%; min-width: 100%; margin: 0; padding: 0; }
      body { font-family: Arial, 'Microsoft JhengHei', sans-serif; background: #f8fafc; color: #374151; }
      #root { max-width: none !important; text-align: initial !important; }
      button { font-family: inherit; cursor: pointer; border: 0; }
      button:disabled { cursor: not-allowed; opacity: .65; }
      input { width: 100%; border: 1px solid #cbd5e1; border-radius: 16px; padding: 11px 14px; font-size: 14px; outline: none; background: #ffffff; color: #374151; }
      input:focus { border-color: #64748b; box-shadow: 0 0 0 3px rgba(100,116,139,.18); background: #ffffff; color: #374151; }
      h1, h2, p { margin: 0; }

      .home-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #f1f5f9; }
      .home-card { width: 100%; max-width: none; background: white; border-radius: 36px; padding: 48px; text-align: center; box-shadow: 0 22px 50px rgba(15,23,42,.12); }
      .home-icon { width: 92px; height: 92px; margin: 0 auto 22px; border-radius: 50%; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; font-size: 42px; }
      .home-card h1 { font-size: clamp(36px, 6vw, 64px); margin-top: 14px; font-weight: 900; color: #374151; }
      .home-desc { max-width: 680px; margin: 22px auto 0; color: #475569; font-size: 18px; line-height: 1.7; }
      .price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 36px; text-align: left; }
      .price-card { border-radius: 24px; padding: 22px; display: grid; gap: 8px; }
      .price-card strong { font-size: 28px; }
      .price-card span { color: #64748b; font-size: 14px; }

      .app-page {
        min-height: 100vh;
        width: 100%;
        max-width: 100%;
        padding: 10px;
        overflow-x: hidden;
        background: #f3f4f6;
      }
      .app-shell {
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }
      .hero-card, .panel { background: rgba(255,255,255,.92); border: 1px solid #e5e7eb; border-radius: 30px; box-shadow: 0 10px 30px rgba(15,23,42,.04); backdrop-filter: blur(10px); }
      .hero-card {
        min-height: 300px;
        padding: 52px;
        display: flex;
        gap: 24px;
        align-items: center;
        justify-content: space-between;
      }
      .hero-card h1 {
        font-size: clamp(64px, 6vw, 110px);
        line-height: .95;
        cursor: pointer;
        margin: 10px 0 12px;
        color: #374151;
        letter-spacing: -0.06em;
        font-weight: 900;
      }
      .hero-card p {
        font-size: 28px;
        color: #6b7280;
      }
      .eyebrow { color: #64748b; font-size: 13px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
      .auth-card {
        width: 100%;
        border: 1px solid #e5e7eb;
        border-radius: 30px;
        padding: 24px;
        background: white;
      }
      .auth-card h2 { font-size: 18px; margin-bottom: 12px; color: #374151; }
      .form-stack { display: grid; gap: 10px; }
      .input-row, .action-row, .user-row, .total-row, .record-top { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
      .input-row input { flex: 1; }

      .layout-grid {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr) 260px;
        gap: 14px;
        align-items: start;
        width: 100%;
        max-width: 100%;
      }
      .panel {
        padding: 24px;
        color: #374151;
      }
      .side-panel {
        display: grid;
        gap: 18px;
        position: sticky;
        top: 18px;
        align-self: start;
        color: #374151;
      }
      .side-panel h2,
      .side-panel p,
      .side-panel button {
        color: #374151;
      }
      .seats-panel {
        min-height: 820px;
      }
      .right-column {
        display: grid;
        gap: 18px;
      }
      .muted { color: #374151; font-size: 14px; font-weight: 500; }
      .admin-text { color: #059669; font-size: 14px; font-weight: 700; margin-top: 4px; }
      .error-text { color: #e11d48; font-size: 14px; font-weight: 700; }
      .system-message {
        background: #eef2ff;
        color: #374151;
        border: 1px solid #c7d2fe;
        border-radius: 18px;
        padding: 12px 16px;
        font-weight: 800;
      }
      .notice { background: #fff1f2; color: #374151; border-radius: 16px; padding: 14px; font-weight: 700; }
      .empty { color: #94a3b8; margin-top: 8px; }

      .primary, .outline, .ghost { border-radius: 16px; padding: 10px 16px; font-weight: 800; font-size: 14px; transition: .15s; }
      .primary { background: linear-gradient(135deg,#111827,#0f172a); color: white; box-shadow: 0 6px 18px rgba(15,23,42,.15); }
      .primary:hover { background: #1e293b; }
      .outline { background: rgba(255,255,255,.9); color: #111827; border: 1px solid #d1d5db; }
      .outline:hover { background: #f8fafc; }
      .ghost { background: transparent; color: #475569; }
      .big { height: 56px; font-size: 18px; padding: 0 36px; margin-top: 34px; }
      .small { width: fit-content; }
      .full { width: 100%; height: 48px; text-align: left; }

      .seat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 22px;
        color: #374151;
      }
      .seat-header h2 {
        color: #374151;
        font-weight: 900;
      }
      .filter-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .filter-buttons button {
        color: #374151;
      }
      .stage {
        width: 82%;
        margin: 0 auto 22px;
        background: linear-gradient(135deg,#020617,#0f172a);
        color: white;
        border-radius: 999px 999px 20px 20px;
        padding: 16px;
        text-align: center;
        font-size: 26px;
        font-weight: 900;
        letter-spacing: .4em;
        box-shadow: 0 14px 34px rgba(15,23,42,.18);
      }
      .seat-scroll { width: 100%; overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }
      .seat-map {
        width: 100%;
        min-width: 0;
        display: grid;
        gap: 8px;
      }
      .seat-row {
        display: flex;
        align-items: center;
        gap: 5px;
        width: 100%;
      }
      .seats-panel {
        color: #374151;
      }
      .seats-panel h2,
      .seats-panel p,
      .seats-panel span,
      .seats-panel div {
        color: #374151;
      }
      .row-label {
        width: 28px;
        flex: 0 0 28px;
        text-align: center;
        font-size: 18px;
        font-weight: 900;
        color: #374151;
      }
      .seat,
      .seat-placeholder {
        height: 34px;
        min-width: 0;
        flex: 1 1 0;
        border-radius: 10px;
        font-size: clamp(8px, 0.8vw, 12px);
        font-weight: 900;
        transition: .15s ease;
        padding: 0;
      }
      .seat.front { background: #ffe4e6; color: #9f1239; border: 1px solid #fecdd3; }
      .seat.middle { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
      .seat.back { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
      .seat.selected { background: #111827; color: white; transform: scale(1.05); box-shadow: 0 10px 20px rgba(15,23,42,.22); }
      .seat.booked { background: #d1d5db; color: #6b7280; }
      .aisle {
        width: 12px;
        flex: 0 0 12px;
        height: 34px;
        border-radius: 8px;
        background: #eef2f7;
      }
      .legend-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
        margin-top: 34px;
      }
      .legend {
        border-radius: 18px;
        padding: 16px;
        font-weight: 800;
        font-size: 16px;
        color: #374151;
      }
      .front-box { background: #ffe4e6; color: #9f1239; }
      .middle-box { background: #fef3c7; color: #92400e; }
      .back-box { background: #dbeafe; color: #1e40af; }
      .booked-box { background: #e2e8f0; color: #475569; }

      .selected-box {
        min-height: 180px;
        background: #f8fafc;
        border-radius: 26px;
        padding: 18px;
        margin-top: 18px;
        color: #374151;
      }
      .right-column,
      .right-column h2,
      .right-column p,
      .right-column span,
      .right-column b,
      .right-column div {
        color: #374151;
      }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .chips span { background: #d1fae5; color: #047857; padding: 7px 10px; border-radius: 999px; font-weight: 800; font-size: 13px; }
      .total-row { font-size: 18px; margin: 18px 0; color: #374151; }
      .records { max-height: 360px; overflow-y: auto; display: grid; gap: 10px; }
      .record-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 14px; }
      .record-card p { color: #374151; margin: 8px 0; }
      .cancel-btn {
        width: 100%;
        margin-top: 12px;
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #be123c;
      }
      .cancel-btn:hover {
        background: #ffe4e6;
      }
      .record-top span { font-size: 13px; color: #64748b; }
      .side-panel h2,
      .side-panel p,
      .side-panel button,
      .seats-panel h2,
      .seats-panel .filter-buttons button,
      .seats-panel .legend,
      .row-label {
        color: #374151 !important;
      }

      .side-panel .primary,
      .filter-buttons .primary {
        color: #374151 !important;
        background: #ffffff !important;
        border: 2px solid #374151 !important;
        box-shadow: none !important;
      }

      @media (max-width: 1100px) {
        .layout-grid { grid-template-columns: 1fr; }
        .hero-card { flex-direction: column; align-items: stretch; }
        .auth-card { width: 100%; }
      }
      @media (max-width: 760px) {
        html, body, #root { width: 100%; max-width: 100%; overflow-x: hidden; }
        .home-page { padding: 10px; align-items: stretch; overflow-x: hidden; }
        .home-card { min-height: calc(100vh - 20px); padding: 28px 16px; border-radius: 28px; display: flex; flex-direction: column; justify-content: center; }
        .home-icon { width: 72px; height: 72px; font-size: 32px; }
        .home-card h1 { font-size: 40px; line-height: 1.05; }
        .home-desc { font-size: 15px; line-height: 1.6; }
        .price-grid, .legend-grid { grid-template-columns: 1fr; }

        .app-page { padding: 8px; overflow-x: hidden; }
        .app-shell { gap: 10px; width: 100%; max-width: 100%; }
        .hero-card { min-height: auto; padding: 22px 16px; border-radius: 24px; }
        .hero-card h1 { font-size: 38px; line-height: 1.05; letter-spacing: -0.04em; }
        .hero-card p { font-size: 14px; line-height: 1.6; }
        .eyebrow { font-size: 10px; letter-spacing: .12em; }

        .layout-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 100%;
        }

        .right-column {
          order: 1;
          width: 100%;
        }

        .side-panel {
          order: 2;
          position: static;
          gap: 10px;
        }

        .seats-panel {
          order: 3;
        }
        .panel, .auth-card { padding: 14px; border-radius: 20px; width: 100%; max-width: 100%; }
        .side-panel { position: static; gap: 10px; }
        .right-column { gap: 10px; width: 100%; max-width: 100%; }
        .input-row { flex-direction: column; align-items: stretch; }
        .input-row .primary { width: 100%; }
        .action-row { grid-template-columns: 1fr 1fr; display: grid; }

        .seat-header { align-items: stretch; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .seat-header h2 { font-size: 20px; }
        .filter-buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
        .filter-buttons button { padding: 8px 4px; font-size: 12px; border-radius: 10px; }
        .stage { width: 100%; margin-bottom: 14px; padding: 10px; font-size: 16px; letter-spacing: .18em; border-radius: 24px 24px 10px 10px; }

        .seats-panel { min-height: auto; overflow: hidden; }
        .seat-scroll { overflow-x: hidden; width: 100%; }
        .seat-map { width: 100%; min-width: 0; gap: 5px; }
        .seat-row { gap: 3px; width: 100%; }
        .row-label { width: 18px; flex: 0 0 18px; font-size: 14px; }
        .seat, .seat-placeholder { height: 24px; border-radius: 6px; font-size: 7px; flex: 1 1 0; min-width: 0; }
        .aisle { width: 5px; flex: 0 0 5px; height: 24px; border-radius: 4px; }
        .legend-grid { gap: 8px; margin-top: 14px; }
        .legend { padding: 10px 12px; font-size: 14px; }

        .selected-box { min-height: 120px; padding: 14px; border-radius: 18px; }
        .chips span { font-size: 12px; }
        .records { max-height: 300px; }
      }
    `}</style>
  );
}
