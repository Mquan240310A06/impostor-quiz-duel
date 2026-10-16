# Impostor vs Crewmate Quiz Duel

Dự án game đối kháng thời gian thực kết hợp suy luận xã hội (Among Us) và đố vui tốc độ (Kahoot Showdown).

## Cấu trúc thư mục
- `server.js`: Máy chủ Node.js & Socket.io quản lý phòng, đồng bộ di chuyển, tính giờ mili-giây và phân định thắng thua server-side.
- `src/components/QuizDuelModal.jsx`: Giao diện React hiển thị bảng câu hỏi 4 màu Kahoot, phím tắt 1-4, hiệu ứng đếm ngược và trạng thái thắng thua.
- `package.json`: Danh sách dependencies cấu hình cho dự án.

## Hướng dẫn khởi chạy
1. Cài đặt các gói phụ thuộc:
   ```bash
   npm install
   ```
2. Khởi chạy WebSocket Server:
   ```bash
   npm start
   # hoặc phát triển tự reload:
   npm run dev
   ```
3. Máy chủ lắng nghe tại cổng `http://localhost:4000`.
