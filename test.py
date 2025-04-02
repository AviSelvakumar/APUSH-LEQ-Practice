import PyPDF2
import json
import re

def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file."""
    with open(pdf_path, 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
    return text

def parse_essay_prompts(text):
    """Parse extracted text into a structured JSON format."""
    prompts_by_period = {}

    # Split the text by period
    periods = re.split(r'(Period \d+:\s*\d+\s*–\s*\d+)', text)

    # Process each period
    for i in range(1, len(periods), 2):
        period_name = periods[i].strip()
        period_content = periods[i + 1].strip()

        prompts_by_period[period_name] = []

        # Split the period content into individual prompts
        prompts = re.split(r'(\d{4}\s*(?:\(B\))?\s*-\s*#\d+(?:\s*\(.\))?:)', period_content)

        for j in range(1, len(prompts), 2):
            prompt_header = prompts[j].strip()
            prompt_text = prompts[j + 1].strip()

            year = re.match(r'(\d{4})', prompt_header).group(1)
            year = year.strip()  # Ensure year is clean

            # Check for sub-prompts
            sub_prompts = []
            parts = re.split(r'\((a|b)\):\s*', prompt_text)
            
            # If sub-prompts are found
            if len(parts) > 1:
                # Process sub-prompts
                for k in range(1, len(parts), 2):
                    part_label = f"({parts[k-1]})" if k > 0 else ""  # Extract the part label
                    prompt = parts[k].strip()  # Extract the prompt text

                    # Create the sub-prompt dictionary
                    sub_prompts.append({"part": part_label, "prompt": prompt})

                # Add the entry with sub_prompts
                prompts_by_period[period_name].append({
                    "year": year,
                    "sub_prompts": sub_prompts
                })
            else:
                # Add as regular prompt if no sub-prompts are found
                prompts_by_period[period_name].append({
                    "year": year,
                    "prompt": prompt_text
                })

    return prompts_by_period

def save_to_json(data, output_path):
    """Save parsed data to a JSON file."""
    with open(output_path, 'w') as json_file:
        json.dump(data, json_file, indent=4)

def main():
    pdf_path = 'essay_prompts_reworded_by_period.pdf'  # Replace with your PDF file path
    output_path = 'essay_prompts.json'  # Output JSON file path

    print("Extracting text from PDF...")
    extracted_text = extract_text_from_pdf(pdf_path)

    print("Parsing essay prompts...")
    parsed_data = parse_essay_prompts(extracted_text)

    print("Saving data to JSON...")
    save_to_json(parsed_data, output_path)

    print(f"Data successfully saved to {output_path}")

if __name__ == "__main__":
    main()
