import desk from "./desk/vi-VN";

// Vietnamese is not one of the framework's built-in languages: this file and
// desk/vi-VN.ts cover the app's own text, and the framework's chat and
// settings text falls back to English (see app/i18n/index.ts).
const messages = {
  desk,
  composerSources: {
    reference: "Tham chiếu một cuộc trò chuyện…",
    group: "Cuộc trò chuyện",
    authentication: "Đăng nhập để thêm tham chiếu.",
    invalid: "Hãy chọn một tham chiếu hợp lệ trước khi gửi.",
    unavailable:
      "Một tham chiếu đã chọn không còn khả dụng. Hãy xóa hoặc chọn lại.",
  },
  composer: {
    removeAttachment: "Xóa {{name}}",
    removeReference: "Xóa tham chiếu {{name}}",
  },
  settings: {
    title: "Cài đặt",
    workspaceTitle: "Không gian làm việc",
    workspaceDescription:
      "Quản lý thành viên nhóm, quyền truy cập tổ chức và tùy chọn chung của không gian làm việc.",
    openTeamSettings: "Mở cài đặt nhóm",
    openResourceSettings: "Mở cài đặt tài nguyên",
    agentTitle: "Quản lý trợ lý AI",
    agentDescription:
      "Quản lý mô hình, khóa API, tự động hóa, giọng nói và các điều khiển khác của trợ lý AI.",
    openAgentSettings: "Quản lý trợ lý AI",
  },
  chat: {
    archiveChat: "Lưu trữ cuộc trò chuyện",
    archiveFailed: "Không thể lưu trữ cuộc trò chuyện.",
    chats: "Cuộc trò chuyện",
    composerPlaceholder: "Hỏi bất cứ điều gì",
    emptyState: "Hãy hỏi tôi bất cứ điều gì",
    heroDescription: "Nhờ trợ lý AI kiểm tra, giải thích hoặc thay đổi ứng dụng này.",
    heroTitle: "Tôi có thể giúp gì?",
    inspectEmptyState: "Hỏi tôi bất cứ điều gì về ứng dụng này",
    inspectSuggestionAction: "Hiện các thao tác có sẵn",
    inspectSuggestionCapabilities: "Ứng dụng này làm được gì?",
    inspectSuggestionHello: "Giúp tôi bắt đầu",
    newChat: "Cuộc trò chuyện mới",
    optionsFor: "Tùy chọn cho {{title}}",
    pinChat: "Ghim cuộc trò chuyện",
    pinned: "Đã ghim",
    recents: "Gần đây",
    retryPreviousRequest:
      "Thử lại yêu cầu trước của tôi vì nhà cung cấp mô hình đã được kết nối.",
    invalidHandoffOptions:
      "Lời nhắc đã được lưu thành bản nháp, nhưng không khôi phục được cài đặt trò chuyện của nó. Hãy xem lại lời nhắc, ngữ cảnh và mô hình trước khi gửi lại.",
    recoveryDraftUnsaved:
      "Các thay đổi trong bản nháp này chưa được lưu. Tải lại cuộc trò chuyện có thể làm mất chúng.",
    retryAttachmentUnavailable:
      "Không thể mở lại tệp đính kèm này để thử lại. Hãy thêm một URL tệp truy cập được rồi thử lại.",
    renameChat: "Đổi tên cuộc trò chuyện",
    renameFailed: "Không thể đổi tên cuộc trò chuyện.",
    renameThread: "Đổi tên {{title}}",
    suggestionActions: "Cho tôi xem các thao tác có sẵn",
    suggestionCapabilities: "Ứng dụng này làm được gì?",
    suggestionCustomize: "Giúp tôi tùy chỉnh ứng dụng này",
    unpinChat: "Bỏ ghim cuộc trò chuyện",
    untitledChat: "Cuộc trò chuyện chưa đặt tên",
  },
  home: {
    communityTitle: "Kết nối với chúng tôi",
    docsAddAction: "Thêm thao tác",
    docsAddPage: "Thêm trang",
    docsGettingStarted: "Bắt đầu",
    docsKeyConcepts: "Khái niệm chính",
    docsTitle: "Tài liệu",
    title: "Bắt đầu",
  },
  navigation: {
    chat: "Trò chuyện",
    collapseSidebar: "Thu gọn thanh bên",
    database: "Cơ sở dữ liệu",
    expandSidebar: "Mở rộng thanh bên",
    extensions: "Tiện ích mở rộng",
    home: "Trang chủ",
    navigation: "Điều hướng",
    navigationDescription: "Điều hướng chính",
    observability: "Giám sát",
    openNavigation: "Mở điều hướng",
    settings: "Cài đặt",
    team: "Nhóm",
  },
  pages: {
    databaseTitle: "Cơ sở dữ liệu",
    observabilityPageTitle: "Giám sát trợ lý AI",
    teamTitle: "Nhóm",
    teamCreateOrgDescription:
      "Tạo một tổ chức để mời đồng đội và chia sẻ ứng dụng này.",
  },
  root: {
    commandActions: "Thao tác",
    commandAppearance: "Giao diện",
    commandSearch: "Tìm kiếm",
    toggleTheme: "Đổi giao diện sáng/tối",
  },
};

export default messages;
