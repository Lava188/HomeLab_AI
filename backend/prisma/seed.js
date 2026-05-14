const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const testCatalogItems = [
  {
    code: "CBC",
    name: "Công thức máu",
    description: "Xét nghiệm công thức máu toàn bộ.",
    category: "Hematology",
    sampleType: "Blood"
  },
  {
    code: "HBA1C",
    name: "HbA1c",
    description: "Đánh giá đường huyết trung bình trong vòng 2-3 tháng.",
    category: "Diabetes",
    sampleType: "Blood"
  },
  {
    code: "LIPID_PROFILE",
    name: "Mỡ máu",
    description: "Đánh giá cholesterol và triglyceride.",
    category: "Cardiometabolic",
    sampleType: "Blood"
  },
  {
    code: "LIVER_FUNCTION",
    name: "Chức năng gan",
    description: "Đánh giá một số chỉ số liên quan chức năng gan.",
    category: "Biochemistry",
    sampleType: "Blood"
  },
  {
    code: "KIDNEY_FUNCTION",
    name: "Chức năng thận",
    description: "Đánh giá một số chỉ số liên quan chức năng thận.",
    category: "Biochemistry",
    sampleType: "Blood"
  },
  {
    code: "GENERAL_CHECKUP",
    name: "Xét nghiệm tổng quát",
    description: "Gói xét nghiệm tổng quát cơ bản.",
    category: "General",
    sampleType: "Blood"
  }
];

async function main() {
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
