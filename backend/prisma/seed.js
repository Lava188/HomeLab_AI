const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const testCatalogItems = [
  {
    code: "CBC",
    name: "Công thức máu",
    description: "Đánh giá các nhóm tế bào máu chính như hồng cầu, bạch cầu và tiểu cầu.",
    category: "Hematology",
    sampleType: "Blood"
  },
  {
    code: "HBA1C",
    name: "HbA1c",
    description: "Đánh giá đường huyết trung bình trong khoảng 2-3 tháng gần đây.",
    category: "Diabetes",
    sampleType: "Blood"
  },
  {
    code: "LIPID_PROFILE",
    name: "Mỡ máu",
    description: "Đánh giá Cholesterol toàn phần, LDL-C, HDL-C và Triglyceride.",
    category: "Cardiometabolic",
    sampleType: "Blood"
  },
  {
    code: "LIVER_FUNCTION",
    name: "Chức năng gan",
    description: "Đánh giá ALT, AST và các chỉ số liên quan nếu có.",
    category: "Biochemistry",
    sampleType: "Blood"
  },
  {
    code: "KIDNEY_FUNCTION",
    name: "Chức năng thận",
    description: "Đánh giá Creatinine, eGFR nếu có và chức năng lọc thận ở mức thông tin chung.",
    category: "Biochemistry",
    sampleType: "Blood"
  },
  {
    code: "GENERAL_CHECKUP",
    name: "Gói tổng quát cơ bản",
    description: "Gồm Công thức máu, Đường huyết/HbA1c, Mỡ máu, Chức năng gan và Chức năng thận.",
    category: "General",
    sampleType: "Blood"
  }
];

async function main() {
  const defaultPasswordHash = await bcrypt.hash("HomeLab@12345", 12);

  for (const item of testCatalogItems) {
    await prisma.testCatalogItem.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        sampleType: item.sampleType,
        active: true
      },
      create: {
        ...item,
        active: true
      }
    });
  }

  await prisma.patient.upsert({
    where: { phone: "0900001001" },
    update: {
      fullName: "Người dùng HomeLab",
      passwordHash: defaultPasswordHash
    },
    create: {
      fullName: "Người dùng HomeLab",
      phone: "0900001001",
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.staffProfile.upsert({
    where: { id: "seed-admin-staff-5j2" },
    update: {
      fullName: "Quản trị viên HomeLab",
      phone: "0900001002",
      role: "ADMIN",
      active: true,
      passwordHash: defaultPasswordHash
    },
    create: {
      id: "seed-admin-staff-5j2",
      fullName: "Quản trị viên HomeLab",
      phone: "0900001002",
      role: "ADMIN",
      active: true,
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.staffProfile.upsert({
    where: { id: "seed-collector-staff-5j2" },
    update: {
      fullName: "Nhân viên lấy mẫu HomeLab",
      phone: "0900001003",
      role: "SAMPLE_COLLECTOR",
      active: true,
      passwordHash: defaultPasswordHash
    },
    create: {
      id: "seed-collector-staff-5j2",
      fullName: "Nhân viên lấy mẫu HomeLab",
      phone: "0900001003",
      role: "SAMPLE_COLLECTOR",
      active: true,
      passwordHash: defaultPasswordHash
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
