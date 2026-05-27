/**
 * SMOKE TEST: Notification Bell v1 (Simplified without axios)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const API_BASE = process.env.API_BASE_URL || "http://localhost:5000";

const TEST_DATA = {
  collectorPhone: "+8499999991",
  collectorName: "Nguyen Van A Test",
  collectorId: null,
  bookingCode: null,
  assignmentId: null
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAPI(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  return { ok: response.ok, status: response.status, data };
}

async function createTestCollector() {
  console.log("\n=== SETUP: Creating test collector ===");

  try {
    const response = await fetchAPI("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify({
        fullName: TEST_DATA.collectorName,
        phone: TEST_DATA.collectorPhone,
        role: "SAMPLE_COLLECTOR",
        active: true
      }),
      headers: {
        "x-demo-user-id": "smoke_test_admin"
      }
    });

    if (response.ok && response.data?.data?.staff) {
      TEST_DATA.collectorId = response.data.data.staff.id;
      console.log("✓ Created/Updated collector:", TEST_DATA.collectorId);
    } else {
      console.log("Note: Collector endpoint response:", response.status, response.data?.message);
    }
  } catch (error) {
    console.log("Note: Collector creation skipped:", error.message);
  }
}

async function checkAdminNotifications() {
  console.log("\n=== TEST 1: Check admin notifications ===");

  try {
    const response = await fetchAPI("/api/admin/notifications", {
      headers: {
        "x-demo-user-id": "smoke_test_admin"
      }
    });

    if (response.ok && response.data?.success && response.data?.data) {
      const { notifications, unreadCount } = response.data.data;
      console.log(`✓ Admin has ${unreadCount} unread notifications`);
      console.log(`  Total notifications: ${notifications.length}`);

      if (notifications.length > 0) {
        console.log("\n  Recent notifications:");
        notifications.slice(0, 5).forEach((n, i) => {
          console.log(`    ${i + 1}. [${n.type}] ${n.title}`);
          if (n.type === "BOOKING_CREATED") {
            TEST_DATA.notificationId = n.id;
          }
        });
      }

      return notifications;
    } else {
      console.log("✗ Failed to fetch admin notifications:", response.status);
    }
  } catch (error) {
    console.log("✗ Error:", error.message);
  }

  return [];
}

async function checkCollectorNotifications() {
  console.log("\n=== TEST 2: Check collector notifications ===");

  try {
    const response = await fetchAPI(`/api/collector/notifications?phone=${encodeURIComponent(TEST_DATA.collectorPhone)}`, {
      headers: {
        "x-demo-phone": TEST_DATA.collectorPhone
      }
    });

    if (response.ok && response.data?.success && response.data?.data) {
      const { notifications, unreadCount } = response.data.data;
      console.log(`✓ Collector has ${unreadCount} unread notifications`);
      console.log(`  Total notifications: ${notifications.length}`);

      if (notifications.length > 0) {
        console.log("\n  Collector notifications:");
        notifications.slice(0, 5).forEach((n, i) => {
          console.log(`    ${i + 1}. [${n.type}] ${n.title}`);
        });
      }

      return notifications;
    } else {
      console.log("✗ Failed to fetch collector notifications:", response.status);
    }
  } catch (error) {
    console.log("✗ Error:", error.message);
  }

  return [];
}

async function testMarkRead() {
  console.log("\n=== TEST 3: Mark notification as read ===");

  const notifications = await checkAdminNotifications();
  const unreadNotification = notifications.find((n) => !n.readAt);

  if (!unreadNotification) {
    console.log("✗ No unread notification found");
    return;
  }

  try {
    const response = await fetchAPI(`/api/admin/notifications/${unreadNotification.id}/read`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "x-demo-user-id": "smoke_test_admin"
      }
    });

    if (response.ok && response.data?.success) {
      console.log("✓ Notification marked as read");
      console.log(`  readAt: ${response.data.data?.readAt}`);

      // Check unreadCount decreased
      const checkResponse = await fetchAPI("/api/admin/notifications", {
        headers: { "x-demo-user-id": "smoke_test_admin" }
      });

      if (checkResponse.ok && checkResponse.data?.data) {
        console.log(`✓ unreadCount updated: ${checkResponse.data.data.unreadCount}`);
      }
    }
  } catch (error) {
    console.log("✗ Error:", error.message);
  }
}

async function testMarkAllRead() {
  console.log("\n=== TEST 4: Mark all notifications as read ===");

  try {
    const response = await fetchAPI("/api/admin/notifications/read-all", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "x-demo-user-id": "smoke_test_admin"
      }
    });

    if (response.ok && response.data?.success) {
      console.log("✓ All notifications marked as read");
      console.log(`  count: ${response.data.data.count}`);

      // Verify unreadCount is 0
      const checkResponse = await fetchAPI("/api/admin/notifications", {
        headers: { "x-demo-user-id": "smoke_test_admin" }
      });

      if (checkResponse.ok && checkResponse.data?.data?.unreadCount === 0) {
        console.log("✓ unreadCount is now 0");
      }
    }
  } catch (error) {
    console.log("✗ Error:", error.message);
  }
}

async function testCreateBooking() {
  console.log("\n=== TEST 5: Create booking (should trigger BOOKING_CREATED notification) ===");

  const bookingData = {
    patientName: "Test Patient Notification",
    phone: "+84912345678",
    testTypeText: "Xét nghiệm máu",
    sampleDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    sampleTimeStart: "09:00",
    sampleTimeEnd: "10:00",
    address: "123 Test Street, Hanoi"
  };

  try {
    const response = await fetchAPI("/api/bookings", {
      method: "POST",
      body: JSON.stringify(bookingData),
      headers: {
        "x-session-id": "smoke_test_session_" + Date.now()
      }
    });

    if (response.ok && response.data?.success) {
      const bookingCode = response.data.data?.data?.bookingCode || response.data.data?.booking?.bookingCode;
      TEST_DATA.bookingCode = bookingCode;
      console.log("✓ Booking created:", bookingCode);
      console.log("  This should have created BOOKING_CREATED notification for admin");

      await sleep(1000);

      // Check if notification was created
      const notifications = await checkAdminNotifications();
      const bookingCreated = notifications.find((n) => n.type === "BOOKING_CREATED");
      if (bookingCreated) {
        console.log("✓ BOOKING_CREATED notification found!");
      } else {
        console.log("✗ BOOKING_CREATED notification NOT found");
      }
    } else {
      console.log("✗ Failed to create booking:", response.status, response.data?.message);
    }
  } catch (error) {
    console.log("✗ Error:", error.message);
  }
}

async function runAllTests() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       SMOKE TEST: Notification Bell v1                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  try {
    await createTestCollector();
    await checkAdminNotifications();
    await checkCollectorNotifications();
    await testCreateBooking();
    await testMarkRead();
    await testMarkAllRead();

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    TEST SUMMARY                                ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log("║ ✓ Check logs above for individual test results               ║");
    console.log("║                                                              ║");
    console.log("║ Manual UI verification steps:                                ║");
    console.log("║ 1. Login as Admin -> should see notification bell           ║");
    console.log("║ 2. Login as Collector -> should see notification bell        ║");
    console.log("║ 3. Click bell -> see notifications dropdown                 ║");
    console.log("║ 4. Click ASSIGNMENT_REJECTED -> see reject reason modal      ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
  } catch (error) {
    console.error("\n✗ Test suite error:", error.message);
  }
}

runAllTests().catch(console.error);
